/**
 * lib/niftyData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Nifty 50 utilities.
 *
 * Live data is fetched from /api/nifty-history (yahoo-finance2 → ^NSEI).
 * The NIFTY_FALLBACK below is a minimal safety net used only when the live
 * fetch fails — it covers only a handful of anchor points so the chart can
 * still render something rather than crashing.
 *
 * Components should call fetchNiftyHistory() and pass the result to
 * getNiftyForMonth() rather than importing NIFTY_FALLBACK directly.
 */

/**
 * Minimal fallback covering ~5 years of year-end anchors.
 * Used only when /api/nifty-history is unreachable.
 */
export const NIFTY_FALLBACK = {
  '2020-03': 8598,
  '2020-12': 13982,
  '2021-12': 17354,
  '2022-12': 18105,
  '2023-12': 21731,
  '2024-12': 23645,
  '2025-12': 27210,
  '2026-04': 23500,
  '2026-05': 24334,
};

/**
 * fetchNiftyHistory
 * Calls the internal API route which proxies yahoo-finance2.
 * Returns a { [month: 'YYYY-MM']: number } map, or null on error.
 *
 * @param {string} from  'YYYY-MM-DD' — earliest date needed (first snapshot date)
 * @returns {Promise<Record<string,number>|null>}
 */
export async function fetchNiftyHistory(from) {
  try {
    const res = await fetch(`/api/nifty-history?from=${from}`, {
      // Cache for 6 hours in the browser — Nifty monthly data doesn't change intraday
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.history && Object.keys(data.history).length > 0
      ? data.history
      : null;
  } catch {
    return null;
  }
}

/**
 * getNiftyForMonth
 * Returns the closest prior month's level from the provided history map.
 * Falls back to NIFTY_FALLBACK if history is null/empty.
 *
 * @param {string}                    month    'YYYY-MM'
 * @param {Record<string,number>|null} history  from fetchNiftyHistory()
 * @returns {number|null}
 */
export function getNiftyForMonth(month, history) {
  const source = (history && Object.keys(history).length > 0)
    ? history
    : NIFTY_FALLBACK;

  if (source[month]) return source[month];

  const prior = Object.keys(source)
    .sort()
    .filter(m => m <= month)
    .pop();

  return prior ? source[prior] : null;
}

/**
 * rebaseToIndex
 * Normalises a value series so the first point = 100.
 *
 * @param {Array<{value: number}>} series
 * @param {number}                 baseValue
 * @returns {Array<{value: number, indexed: number}>}
 */
export function rebaseToIndex(series, baseValue) {
  return series.map(d => ({
    ...d,
    indexed: baseValue > 0 ? (d.value / baseValue) * 100 : 100,
  }));
}

/**
 * isNiftyDataStale
 * When using the fallback, checks whether today is beyond the last fallback entry.
 * Always returns false when live data is available (it covers up to today by definition).
 *
 * @param {Record<string,number>|null} history  live history from fetchNiftyHistory()
 * @returns {boolean}
 */
export function isNiftyDataStale(history) {
  if (history && Object.keys(history).length > 0) return false;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const lastKey = Object.keys(NIFTY_FALLBACK).sort().pop();
  return currentMonth > lastKey;
}

/** Last month covered — useful for UI warnings when on fallback data. */
export function niftyDataLastMonth(history) {
  const source = (history && Object.keys(history).length > 0)
    ? history
    : NIFTY_FALLBACK;
  return Object.keys(source).sort().pop();
}
