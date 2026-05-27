'use client';

/**
 * useBenchmarkComparison
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches live historical data for all 4 benchmarks (Nifty 50, Sensex,
 * Nifty Midcap 100, Nifty Smallcap 100) and computes point-to-point rolling
 * returns (1Y, 3Y, 5Y) for both the benchmarks and the portfolio.
 *
 * Portfolio returns are derived from saved snapshots when available, falling
 * back to a CAGR estimate from the current portfolio stats.
 *
 * Benchmark returns are computed as:
 *   ((current_level / level_N_years_ago) - 1) * 100
 * using the live Upstox history fetched via /api/nifty-history.
 */

import { useState, useEffect, useRef } from 'react';
import { BENCHMARKS, getBenchmarkForMonth } from '@/lib/niftyData';

const BENCHMARK_KEYS = ['nifty50', 'sensex', 'niftymidcap', 'niftysmallcap'];

/**
 * Returns the 'YYYY-MM' string that is `yearsBack` years before `fromMonth`.
 */
function monthsAgo(fromMonth, yearsBack) {
  const [y, m] = fromMonth.split('-').map(Number);
  const targetYear = y - yearsBack;
  return `${targetYear}-${String(m).padStart(2, '0')}`;
}

/**
 * Compute point-to-point return % between two monthly levels.
 */
function ptpReturn(levelNow, levelThen) {
  if (!levelNow || !levelThen || levelThen <= 0) return null;
  return ((levelNow / levelThen) - 1) * 100;
}

/**
 * Derive portfolio return over N years from snapshots.
 * Finds the snapshot closest to `targetMonth` and compares to latest.
 */
function portfolioReturnFromSnapshots(snapshots, targetMonth, latestValue) {
  if (!snapshots || !snapshots.length || !latestValue) return null;

  // Find closest snapshot at or before targetMonth
  const sorted = [...snapshots].sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
  const target = `${targetMonth}-28`; // end of that month
  const candidates = sorted.filter(s => s.snapshotAt.slice(0, 7) <= targetMonth);
  if (!candidates.length) return null;

  const snap = candidates[candidates.length - 1];
  const snapValue = parseFloat(snap.totalValue);
  if (!snapValue || snapValue <= 0) return null;

  return ((latestValue / snapValue) - 1) * 100;
}

export function useBenchmarkComparison({ snapshots, stats }) {
  const [histories, setHistories] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchAll() {
      setLoading(true);
      setError(null);

      // We need ~5 years of history — fetch from 5 years ago
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const fromDate = fiveYearsAgo.toISOString().slice(0, 10);

      const results = {};
      await Promise.all(
        BENCHMARK_KEYS.map(async (key) => {
          try {
            const res = await fetch(
              `/api/nifty-history?from=${fromDate}&benchmark=${key}`,
              { signal: controller.signal }
            );
            if (res.ok) {
              const data = await res.json();
              if (data.history && Object.keys(data.history).length > 0) {
                results[key] = data.history;
              } else {
                results[key] = null; // will use fallback
              }
            }
          } catch (e) {
            if (e.name !== 'AbortError') {
              results[key] = null;
            }
          }
        })
      );

      if (!controller.signal.aborted) {
        setHistories(results);
        setLoading(false);
      }
    }

    fetchAll();
    return () => controller.abort();
  }, []); // fetch once on mount

  // Compute rolling returns once histories are loaded
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month1yAgo   = monthsAgo(currentMonth, 1);
  const month3yAgo   = monthsAgo(currentMonth, 3);
  const month5yAgo   = monthsAgo(currentMonth, 5);

  const benchmarkRows = BENCHMARK_KEYS.map((key) => {
    const hist = histories[key] ?? null; // null = use fallback
    const bench = BENCHMARKS[key];

    const levelNow  = getBenchmarkForMonth(currentMonth, hist, key);
    const level1y   = getBenchmarkForMonth(month1yAgo,   hist, key);
    const level3y   = getBenchmarkForMonth(month3yAgo,   hist, key);
    const level5y   = getBenchmarkForMonth(month5yAgo,   hist, key);

    return {
      key,
      name:    bench.label,
      color:   bench.color,
      ret1y:   ptpReturn(levelNow, level1y),
      ret3y:   ptpReturn(levelNow, level3y),   // total, not annualised
      ret3yCA: level3y && levelNow ? (Math.pow(levelNow / level3y, 1 / 3) - 1) * 100 : null,
      ret5y:   ptpReturn(levelNow, level5y),
      ret5yCA: level5y && levelNow ? (Math.pow(levelNow / level5y, 1 / 5) - 1) * 100 : null,
      usingFallback: !hist,
    };
  });

  // Portfolio rolling returns from snapshots
  const latestValue = stats?.totalValue ?? 0;

  const portRet1y = portfolioReturnFromSnapshots(snapshots, month1yAgo, latestValue);
  const portRet3y = portfolioReturnFromSnapshots(snapshots, month3yAgo, latestValue);
  const portRet5y = portfolioReturnFromSnapshots(snapshots, month5yAgo, latestValue);

  // Annualised CAGR from point-to-point for portfolio
  const portRet3yCA = portRet3y != null
    ? (Math.pow(1 + portRet3y / 100, 1 / 3) - 1) * 100 : null;
  const portRet5yCA = portRet5y != null
    ? (Math.pow(1 + portRet5y / 100, 1 / 5) - 1) * 100 : null;

  const portfolioRow = {
    ret1y:   portRet1y,
    ret3y:   portRet3y,
    ret3yCA: portRet3yCA,
    ret5y:   portRet5y,
    ret5yCA: portRet5yCA,
    // Fallback: use overallCagr as 5Y estimate when no snapshots
    cagrEstimate: stats?.overallCagr ?? null,
    hasSnapData:  portRet1y != null || portRet3y != null || portRet5y != null,
  };

  const anyFallback = benchmarkRows.some(b => b.usingFallback);

  return {
    loading,
    error,
    benchmarkRows,
    portfolioRow,
    anyFallback,
    currentMonth,
  };
}
