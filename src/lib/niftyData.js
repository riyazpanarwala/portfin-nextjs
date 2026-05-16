/**
 * lib/niftyData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Benchmark configuration and Nifty 50 utilities.
 *
 * BENCHMARKS defines every index the app can compare against.
 * Each entry carries:
 *   label       – display name shown in the UI
 *   yahooTicker – symbol passed to Yahoo Finance historical API
 *   color       – chart line colour (CSS-safe hex)
 *   fallback    – sparse anchor points used when live fetch fails
 *
 * The NIFTY_FALLBACK export is kept for backward compatibility with any
 * code that still imports it directly; prefer BENCHMARKS['nifty50'].fallback.
 */

// ─── Benchmark registry ───────────────────────────────────────────────────────

export const BENCHMARKS = {
  nifty50: {
    label:       'Nifty 50',
    yahooTicker: '^NSEI',
    color:       '#f59e0b',   // amber
    fallback: {
      '2020-03': 8598,
      '2020-12': 13982,
      '2021-12': 17354,
      '2022-12': 18105,
      '2023-12': 21731,
      '2024-03': 22327,
      '2024-06': 23644,
      '2024-09': 25811,
      '2024-12': 23644,
      '2025-03': 22161,
      '2025-06': 24500,
      '2025-12': 27210,
      '2026-04': 23500,
      '2026-05': 24334,
    },
  },
  sensex: {
    label:       'Sensex',
    yahooTicker: '^BSESN',
    color:       '#f97316',   // orange
    fallback: {
      '2020-03': 29468,
      '2020-12': 47751,
      '2021-12': 58253,
      '2022-12': 60840,
      '2023-12': 72241,
      '2024-12': 78140,
      '2025-12': 89000,
      '2026-04': 77500,
      '2026-05': 80400,
    },
  },
  niftymidcap: {
    label:       'Nifty Midcap 100',
    // Primary ticker on Yahoo Finance for this index.
    // ^CRSMID is the correct caret-symbol; NIFTY_MIDCAP_100.NS is the .NS
    // variant — the API route tries both in sequence.
    // NOTE: ^CNXMID does NOT exist on Yahoo Finance (returns 404).
    yahooTicker: '^CRSMID',
    yahooTickerAlt: 'NIFTY_MIDCAP_100.NS',  // tried if ^CRSMID returns no rows
    color:       '#a78bfa',   // purple
    fallback: {
      '2020-03': 13839,
      '2020-12': 22771,
      '2021-12': 33007,
      '2022-12': 32122,
      '2023-12': 45136,
      '2024-03': 50170,
      '2024-06': 55016,
      '2024-09': 62016,
      '2024-12': 54016,
      '2025-03': 49800,
      '2025-06': 56000,
      '2025-12': 64000,
      '2026-04': 51000,
      '2026-05': 54500,
    },
  },
  niftysmallcap: {
    label:       'Nifty Smallcap 100',
    // ^CNXSC is correct and confirmed working on Yahoo Finance.
    yahooTicker: '^CNXSC',
    color:       '#34d399',   // green
    fallback: {
      '2020-03': 4356,
      '2020-12': 8021,
      '2021-12': 12474,
      '2022-12': 11219,
      '2023-12': 16622,
      '2024-03': 18500,
      '2024-06': 20100,
      '2024-09': 22500,
      '2024-12': 18450,
      '2025-03': 16800,
      '2025-06': 19000,
      '2025-12': 21500,
      '2026-04': 16700,
      '2026-05': 17800,
    },
  },
  fd: {
    label:       'FD / Risk-free (7.1% p.a.)',
    yahooTicker: null,   // synthetic — no live fetch needed
    color:       '#94a3b8', // slate
    fallback:    {},     // generated dynamically in getFDSeries()
  },
};

// Backward-compat alias
export const NIFTY_FALLBACK = BENCHMARKS.nifty50.fallback;

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * fetchBenchmarkHistory
 * Calls /api/nifty-history with the given benchmark key.
 * Returns { history, source, warning } or null on total failure.
 * For the synthetic FD benchmark returns null (caller uses getFDSeries instead).
 *
 * @param {string} from       'YYYY-MM-DD'
 * @param {string} benchKey   key of BENCHMARKS (default 'nifty50')
 */
export async function fetchBenchmarkHistory(from, benchKey = 'nifty50') {
  if (benchKey === 'fd') return null; // FD is synthetic, no fetch needed

  try {
    const res = await fetch(
      `/api/nifty-history?from=${from}&benchmark=${benchKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.history || Object.keys(data.history).length === 0) return null;
    return {
      history: data.history,
      source:  data.source  || 'unknown',
      warning: data.warning || null,
    };
  } catch {
    return null;
  }
}

// Keep old name for any remaining callers
export async function fetchNiftyHistory(from) {
  return fetchBenchmarkHistory(from, 'nifty50');
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * getBenchmarkForMonth
 * Returns the closest prior month's level from the provided history map,
 * falling back to the benchmark's built-in fallback table when history is null.
 *
 * @param {string}                    month      'YYYY-MM'
 * @param {Record<string,number>|null} history   from fetchBenchmarkHistory()
 * @param {string}                    benchKey   key of BENCHMARKS
 * @returns {number|null}
 */
export function getBenchmarkForMonth(month, history, benchKey = 'nifty50') {
  const fallback = BENCHMARKS[benchKey]?.fallback ?? NIFTY_FALLBACK;
  const source = (history && Object.keys(history).length > 0) ? history : fallback;

  if (source[month]) return source[month];

  const prior = Object.keys(source)
    .sort()
    .filter(m => m <= month)
    .pop();

  return prior ? source[prior] : null;
}

// Backward-compat alias (used widely in existing code)
export function getNiftyForMonth(month, history) {
  return getBenchmarkForMonth(month, history, 'nifty50');
}

// ─── Synthetic FD series ──────────────────────────────────────────────────────

/**
 * getFDSeries
 * Generates a synthetic fixed-deposit growth series indexed to 100 at the
 * first portfolio snapshot, compounding at FD_RATE monthly.
 *
 * @param {Array<{month: string}>} portfolioSeries  snapshot months
 * @param {number}                 rate              annual rate as decimal (default 0.071)
 * @returns {Array<{month: string, value: number}>}
 */
const FD_RATE = 0.071;

export function getFDSeries(portfolioSeries, rate = FD_RATE) {
  if (!portfolioSeries.length) return [];
  const origin = portfolioSeries[0].month;
  return portfolioSeries.map(d => {
    const [oy, om] = origin.split('-').map(Number);
    const [dy, dm] = d.month.split('-').map(Number);
    const months = (dy - oy) * 12 + (dm - om);
    return {
      month: d.month,
      value: 100 * Math.pow(1 + rate / 12, months),
    };
  });
}

// ─── Staleness helpers ────────────────────────────────────────────────────────

/**
 * isBenchmarkDataStale
 * Returns true when using fallback data and the current month is beyond
 * the last fallback entry.
 */
export function isBenchmarkDataStale(history, benchKey = 'nifty50') {
  if (history && Object.keys(history).length > 0) return false;
  const fallback = BENCHMARKS[benchKey]?.fallback ?? NIFTY_FALLBACK;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const lastKey = Object.keys(fallback).sort().pop();
  return currentMonth > lastKey;
}

// Backward-compat alias
export function isNiftyDataStale(history) {
  return isBenchmarkDataStale(history, 'nifty50');
}

/**
 * benchmarkDataLastMonth
 * Returns the last covered month from live history or the fallback table.
 */
export function benchmarkDataLastMonth(history, benchKey = 'nifty50') {
  const fallback = BENCHMARKS[benchKey]?.fallback ?? NIFTY_FALLBACK;
  const source = (history && Object.keys(history).length > 0) ? history : fallback;
  return Object.keys(source).sort().pop();
}

// Backward-compat alias
export function niftyDataLastMonth(history) {
  return benchmarkDataLastMonth(history, 'nifty50');
}

// ─── Rebase helper ────────────────────────────────────────────────────────────

/**
 * rebaseToIndex
 * Normalises a series so the first point = 100.
 */
export function rebaseToIndex(series, baseValue) {
  return series.map(d => ({
    ...d,
    indexed: baseValue > 0 ? (d.value / baseValue) * 100 : 100,
  }));
}
