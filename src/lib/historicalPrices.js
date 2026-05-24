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

/**
 * fetchMFHistoricalNAV
 * Fetches full NAV history for a mutual fund scheme from AMFI's mfhistorical API.
 * Returns a map { 'YYYY-MM': nav } — last NAV of each month.
 *
 * AMFI provides a free daily NAV file AND a historical NAV lookup at:
 *   https://api.mfapi.in/mf/{schemeCode}
 * We use mfapi.in (a free community wrapper over AMFI data).
 *
 * @param {string} isin       ISIN of the MF scheme (e.g. INF179K01VL3)
 * @param {string} fromDate   'YYYY-MM-DD'
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchMFHistoricalNAV(isin, fromDate) {
  // Step 1: resolve ISIN → scheme code via mfapi search
  const schemeCode = await resolveISINtoSchemeCode(isin);
  if (!schemeCode) return {};

  // Step 2: fetch full NAV history
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const navData = data?.data ?? [];
    // navData: [{ date: 'DD-MM-YYYY', nav: '123.456' }] — newest first
    const fromMs = new Date(fromDate).getTime();

    const monthMap = {};
    for (const row of navData) {
      // Parse 'DD-MM-YYYY'
      const [dd, mm, yyyy] = (row.date || "").split("-");
      if (!dd || !mm || !yyyy) continue;
      const dateMs = new Date(`${yyyy}-${mm}-${dd}`).getTime();
      if (isNaN(dateMs) || dateMs < fromMs) continue;

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
 * Uses mfapi.in's search endpoint to find the AMFI scheme code for an ISIN.
 * Returns null on failure.
 */
async function resolveISINtoSchemeCode(isin) {
  try {
    const res = await fetch(
      `https://api.mfapi.in/mf/search?q=${encodeURIComponent(isin)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    // data: [{ schemeCode, schemeName, ... }]
    if (!Array.isArray(data) || !data.length) return null;
    return String(data[0].schemeCode);
  } catch {
    return null;
  }
}

/**
 * fetchMFHistoricalNAVByName
 * Fallback when ISIN is unavailable — searches mfapi by scheme name.
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
    return fetchMFHistoricalNAV_byCode(schemeCode, fromDate);
  } catch {
    return {};
  }
}

async function fetchMFHistoricalNAV_byCode(schemeCode, fromDate) {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const navData = data?.data ?? [];
    const fromMs = new Date(fromDate).getTime();
    const monthMap = {};
    for (const row of navData) {
      const [dd, mm, yyyy] = (row.date || "").split("-");
      if (!dd || !mm || !yyyy) continue;
      const dateMs = new Date(`${yyyy}-${mm}-${dd}`).getTime();
      if (isNaN(dateMs) || dateMs < fromMs) continue;
      const nav = parseFloat(row.nav);
      if (isNaN(nav) || nav <= 0) continue;
      const monthKey = `${yyyy}-${mm}`;
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = Math.round(nav * 10000) / 10000;
      }
    }
    return monthMap;
  } catch {
    return {};
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
