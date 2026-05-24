/**
 * lib/historicalPrices.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches historical end-of-month prices for stocks (Yahoo Finance) and
 * mutual funds (AMFI historical NAV API).
 *
 * Used by the backfill-snapshots API to reconstruct month-by-month portfolio
 * values going back to the first trade date.
 */

import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
});

/* ────────────────────────────────────────────────────────────────────────────
   Known fund mergers / renames
   ────────────────────────────────────────────────────────────────────────────
   When a mutual fund is merged into another AMC or renamed, AMFI assigns a
   new scheme code.  The old scheme code stops updating on the merger date and
   the new one starts from that date.  To get a continuous history we must
   fetch BOTH codes and stitch them at the merger date.

   Key:   current scheme code (post-merger)
   Value: { predecessorCode, effectiveDate }  — predecessor data is used
          strictly BEFORE effectiveDate; current data is used FROM
          effectiveDate onwards.
   ────────────────────────────────────────────────────────────────────────── */
const FUND_MERGER_MAP = {
  /* HSBC Small Cap Fund — Direct Plan — Growth
     Formerly: L&T Emerging Businesses Fund — Direct Plan — Growth
     Merger effective: 2022-11-26 (L&T MF merged into HSBC MF) */
  151130: {
    predecessorCode: "129220",
    effectiveDate: "2022-11-26",
  },
};

/**
 * getLastTradingDayOfMonth
 * Returns 'YYYY-MM-DD' for the last calendar day of the given month.
 * Yahoo Finance will return the closest prior trading day automatically.
 */
function lastDayOfMonth(year, month) {
  // month is 1-based
  const d = new Date(Date.UTC(year, month, 0)); // day 0 = last day of prev month
  return d.toISOString().slice(0, 10);
}

/**
 * fetchStockMonthlyPrices
 * Returns a map { 'YYYY-MM': closingPrice } for the given stock symbol,
 * from `fromDate` to today, sampled at month-end.
 *
 * @param {string} symbol     NSE/BSE symbol
 * @param {string} exchange   'NSE' | 'BSE'
 * @param {string} fromDate   'YYYY-MM-DD'
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchStockMonthlyPrices(symbol, exchange, fromDate) {
  const yahooSym = exchange === "BSE" ? `${symbol}.BO` : `${symbol}.NS`;

  try {
    const result = await yahoo.chart(
      yahooSym,
      {
        period1: fromDate,
        period2: new Date().toISOString().slice(0, 10),
        interval: "1mo",
        return: "array",
      },
      { timeout: 20000 },
    );

    const quotes = result?.quotes ?? [];
    const priceMap = {};

    for (const q of quotes) {
      if (!q.date) continue;
      const close = q.adjClose ?? q.close ?? null;
      if (close == null || close <= 0) continue;
      const month = new Date(q.date).toISOString().slice(0, 7); // 'YYYY-MM'
      priceMap[month] = Math.round(close * 100) / 100;
    }

    console.log(
      `[historicalPrices] Fetched ${Object.keys(priceMap).length} monthly prices for ${yahooSym}`,
    );

    return priceMap;
  } catch (err) {
    console.warn(
      `[historicalPrices] Yahoo fetch failed for ${yahooSym}:`,
      err.message,
    );
    return {};
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Mutual-fund NAV helpers
   ────────────────────────────────────────────────────────────────────────── */

/**
 * fetchMFHistoricalNAV
 * Fetches full NAV history for a mutual fund scheme from AMFI's mfhistorical API.
 * Returns a map { 'YYYY-MM': nav } — last NAV of each month.
 *
 * If the fund has a known predecessor (merger/rename), this function
 * automatically stitches the predecessor history (before merger date) with the
 * current history (from merger date onwards) so callers get one continuous
 * series.
 *
 * @param {string} isin       ISIN of the MF scheme (e.g. INF179K01VL3)
 * @param {string} fromDate   'YYYY-MM-DD'
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchMFHistoricalNAV(isin, fromDate) {
  // Step 1: resolve ISIN → scheme code via AMFI daily NAV file
  const schemeCode = await resolveISINtoSchemeCode(isin);
  if (!schemeCode) {
    console.warn(
      `[historicalPrices] Could not resolve ISIN ${isin} to scheme code`,
    );
    return {};
  }

  const mergerInfo = FUND_MERGER_MAP[schemeCode];

  // No known merger — single fetch
  if (!mergerInfo) {
    return fetchMFHistoricalNAV_byCode(schemeCode, fromDate);
  }

  // Known merger — fetch predecessor + current in parallel
  console.log(
    `[historicalPrices] Fund ${schemeCode} has predecessor ${mergerInfo.predecessorCode} ` +
      `(merger on ${mergerInfo.effectiveDate}). Fetching stitched history…`,
  );

  const [predecessorMap, currentMap] = await Promise.all([
    // Predecessor: from the user's fromDate up to (but not including) merger date
    fetchMFHistoricalNAV_byCode(
      mergerInfo.predecessorCode,
      fromDate,
      mergerInfo.effectiveDate,
    ),
    // Current: from merger date onwards
    fetchMFHistoricalNAV_byCode(schemeCode, mergerInfo.effectiveDate),
  ]);

  // Merge: current overrides predecessor on the merger month (if overlap)
  const stitched = { ...predecessorMap, ...currentMap };

  console.log(
    `[historicalPrices] Stitched ${Object.keys(predecessorMap).length} (pre) + ` +
      `${Object.keys(currentMap).length} (post) = ${Object.keys(stitched).length} monthly NAVs ` +
      `for schemeCode ${schemeCode}`,
  );

  return stitched;
}

/**
 * fetchMFHistoricalNAVByName
 * Fallback when ISIN is unavailable — searches mfapi by scheme name.
 * Also checks the merger map so stitched histories work by name too.
 *
 * @param {string} name       Fund name (partial is fine)
 * @param {string} fromDate   'YYYY-MM-DD'
 */
export async function fetchMFHistoricalNAVByName(name, fromDate) {
  try {
    const res = await fetch(
      `https://api.mfapi.in/mf/search?q=${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return {};
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return {};

    // Pick first result
    const schemeCode = String(data[0].schemeCode);
    const mergerInfo = FUND_MERGER_MAP[schemeCode];

    if (!mergerInfo) {
      return fetchMFHistoricalNAV_byCode(schemeCode, fromDate);
    }

    const [predecessorMap, currentMap] = await Promise.all([
      fetchMFHistoricalNAV_byCode(
        mergerInfo.predecessorCode,
        fromDate,
        mergerInfo.effectiveDate,
      ),
      fetchMFHistoricalNAV_byCode(schemeCode, mergerInfo.effectiveDate),
    ]);

    return { ...predecessorMap, ...currentMap };
  } catch {
    return {};
  }
}

/**
 * fetchMFHistoricalNAV_byCode
 * Low-level fetcher.  Calls mfapi.in for a specific AMFI scheme code and
 * returns { 'YYYY-MM': nav } for the last NAV of each month.
 *
 * @param {string} schemeCode   AMFI scheme code
 * @param {string} fromDate     'YYYY-MM-DD' — inclusive start
 * @param {string|null} toDate  'YYYY-MM-DD' — exclusive end (optional)
 * @returns {Promise<Record<string, number>>}
 */
async function fetchMFHistoricalNAV_byCode(
  schemeCode,
  fromDate,
  toDate = null,
) {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const navData = data?.data ?? [];
    // navData: [{ date: 'DD-MM-YYYY', nav: '123.456' }] — newest first

    const fromMs = new Date(fromDate).getTime();
    const toMs = toDate ? new Date(toDate).getTime() : Infinity;

    const monthMap = {};
    for (const row of navData) {
      // Parse 'DD-MM-YYYY'
      const [dd, mm, yyyy] = (row.date || "").split("-");
      if (!dd || !mm || !yyyy) continue;

      const dateMs = new Date(`${yyyy}-${mm}-${dd}`).getTime();
      if (isNaN(dateMs) || dateMs < fromMs || dateMs >= toMs) continue;

      const nav = parseFloat(row.nav);
      if (isNaN(nav) || nav <= 0) continue;

      const monthKey = `${yyyy}-${mm}`;
      // Keep only one entry per month — since data is newest-first,
      // the first entry we see for a month is the last NAV of that month.
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = Math.round(nav * 10000) / 10000;
      }
    }

    return monthMap;
  } catch (err) {
    console.warn(
      `[historicalPrices] mfapi fetch failed for schemeCode ${schemeCode}:`,
      err.message,
    );
    return {};
  }
}

/**
 * resolveISINtoSchemeCode
 * Uses AMFI's daily NAV text file to find the AMFI scheme code for an ISIN.
 * Returns null on failure.
 */
async function resolveISINtoSchemeCode(isin) {
  const normalizedIsin = (isin || "").trim().toUpperCase();
  if (!normalizedIsin) return null;

  try {
    const res = await fetch("https://portal.amfiindia.com/spages/NAVAll.txt", {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const text = await res.text();

    for (const line of text.split("\n")) {
      const parts = line.split(";");
      if (parts.length < 5) continue;

      const schemeCode = parts[0]?.trim();
      const isinGrowth = parts[1]?.trim().toUpperCase();
      const isinDiv = parts[2]?.trim().toUpperCase();

      if (
        schemeCode &&
        (isinGrowth === normalizedIsin || isinDiv === normalizedIsin)
      ) {
        return schemeCode;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * buildMonthRange
 * Returns an array of 'YYYY-MM' strings from fromMonth to toMonth inclusive.
 */
export function buildMonthRange(fromMonth, toMonth) {
  const months = [];
  let [y, m] = fromMonth.split("-").map(Number);
  const [ey, em] = toMonth.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}
