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
import { parseAmfiNav } from './amfiNav.js';

const yahoo = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
});

// Same surviving direct-growth scheme, renamed on the L&T acquisition.
// https://www.assetmanagement.hsbc.co.in/en/mutual-funds/acquisition-of-lt-mutual-fund
const FUND_PREDECESSORS = {
  INF917K01QA1: { schemeCode: '129220', before: '2022-11-25' },
};

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
export async function fetchStockMonthlyPrices(symbol, exchange, fromDate, { daily = false } = {}) {
  const yahooSym = exchange === "BSE" ? `${symbol}.BO` : `${symbol}.NS`;

  try {
    const result = await yahoo.chart(
      yahooSym,
      {
        period1: fromDate,
        period2: new Date().toISOString().slice(0, 10),
        interval: "1d",
        return: "array",
      },
      { timeout: 20000 },
    );

    const quotes = result?.quotes ?? [];
    const priceMap = {};

    for (const q of quotes) {
      if (!q.date) continue;
      // Yahoo close excludes dividend adjustment; undo later split normalization
      // so the price uses the actual units owned on this historical date.
      let close = q.close ?? null;
      if (close == null || close <= 0) continue;
      for (const split of result.events?.splits || []) {
        if (new Date(split.date) > new Date(q.date)) close *= split.numerator / split.denominator;
      }
      const asOf = new Date(q.date).toISOString().slice(0, 10);
      const month = daily ? asOf : asOf.slice(0, 7);
      if (!Number.isFinite(close) || close <= 0) continue;
      if (!priceMap[month] || priceMap[month].asOf < asOf) priceMap[month] = { price: close, asOf, source: 'yahoo-close' };
    }

    console.log(
      `[historicalPrices] Fetched ${Object.keys(priceMap).length} ${daily ? 'daily' : 'monthly'} prices for ${yahooSym}`,
    );

    return priceMap;
  } catch (err) {
    console.warn(
      `[historicalPrices] Yahoo fetch failed for ${yahooSym}:`,
      err.message,
    );
    throw err;
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
export async function fetchMFHistoricalNAV(isin, fromDate, { daily = false } = {}) {
  // Step 1: resolve ISIN → scheme code via AMFI daily NAV file
  const schemeCode = await resolveISINtoSchemeCode(isin);
  if (!schemeCode) {
    console.warn(
      `[historicalPrices] Could not resolve ISIN ${isin} to scheme code`,
    );
    return {};
  }

  const current = await fetchMFHistoricalNAV_byCode(schemeCode, fromDate, null, daily);
  const predecessor = FUND_PREDECESSORS[isin.trim().toUpperCase()];
  if (!predecessor || fromDate >= predecessor.before) return current;
  const previous = await fetchMFHistoricalNAV_byCode(predecessor.schemeCode, fromDate, predecessor.before, daily);
  for (const [key, record] of Object.entries(previous)) {
    previous[key] = { ...record, source: `mfapi-predecessor-${predecessor.schemeCode}` };
  }
  return { ...previous, ...current };
}

/**
 * fetchMFHistoricalNAVByName
 * Fallback when ISIN is unavailable — searches mfapi by scheme name.
 * Also checks the merger map so stitched histories work by name too.
 *
 * @param {string} name       Fund name (partial is fine)
 * @param {string} fromDate   'YYYY-MM-DD'
 */
export async function fetchMFHistoricalNAVByName() {
  throw new Error("A verified ISIN is required; ambiguous fund name lookup is disabled.");
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
  daily = false,
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

      if (!/^\d+(\.\d+)?$/.test(String(row.nav))) continue;
      const nav = Number(row.nav);
      if (!Number.isFinite(nav) || nav <= 0) continue;
      if (new Date(dateMs).toISOString().slice(0, 10) !== `${yyyy}-${mm}-${dd}`) continue;

      const monthKey = daily ? `${yyyy}-${mm}-${dd}` : `${yyyy}-${mm}`;
      // Keep only one entry per month — since data is newest-first,
      // the first entry we see for a month is the last NAV of that month.
      if (!monthMap[monthKey] || monthMap[monthKey].asOf < yyyy + "-" + mm + "-" + dd) {
        monthMap[monthKey] = { price: nav, asOf: yyyy + "-" + mm + "-" + dd, source: "mfapi-isin" };
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

    return parseAmfiNav(text).get(normalizedIsin)?.schemeCode || null;
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
