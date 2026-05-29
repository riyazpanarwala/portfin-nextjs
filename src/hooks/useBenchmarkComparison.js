'use client';

/**
 * Compact benchmark comparison model for AnalyticsView.
 *
 * Fetching and benchmark series setup live in useBenchmarkSeries. This hook
 * only reshapes that shared data into the 1Y / 3Y / 5Y rows used by the
 * compact analytics table.
 */

import { BENCHMARKS, getBenchmarkForMonth } from '@/lib/niftyData';
import {
  calculatePointReturn,
  subtractMonths,
  useBenchmarkSeries,
} from '@/hooks/useBenchmarkSeries';

const BENCHMARK_KEYS = ['nifty50', 'sensex', 'niftymidcap', 'niftysmallcap'];

function portfolioReturnFromSnapshots(snapshots, targetMonth, latestValue) {
  if (!snapshots || !snapshots.length || !latestValue) return null;

  const sorted = [...snapshots].sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt));
  const candidates = sorted.filter(s => s.snapshotAt.slice(0, 7) <= targetMonth);
  if (!candidates.length) return null;

  const snapValue = parseFloat(candidates[candidates.length - 1].totalValue);
  return snapValue > 0 ? calculatePointReturn(snapValue, latestValue) : null;
}

export function useBenchmarkComparison({ snapshots, stats }) {
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  const {
    benchError: error,
    benchHistories,
    benchLoading,
  } = useBenchmarkSeries({
    snapshots,
    activeBenchKeys: BENCHMARK_KEYS,
    fetchFromDate: fiveYearsAgo.toISOString().slice(0, 10),
    resetOnStartDateChange: false,
  });

  const loading = benchLoading || BENCHMARK_KEYS.some(key => !(key in benchHistories));
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month1yAgo = subtractMonths(currentMonth, 12);
  const month3yAgo = subtractMonths(currentMonth, 36);
  const month5yAgo = subtractMonths(currentMonth, 60);

  const benchmarkRows = BENCHMARK_KEYS.map((key) => {
    const hist = benchHistories[key]?.history ?? null;
    const bench = BENCHMARKS[key];

    const levelNow = getBenchmarkForMonth(currentMonth, hist, key);
    const level1y = getBenchmarkForMonth(month1yAgo, hist, key);
    const level3y = getBenchmarkForMonth(month3yAgo, hist, key);
    const level5y = getBenchmarkForMonth(month5yAgo, hist, key);

    return {
      key,
      name: bench.label,
      color: bench.color,
      ret1y: calculatePointReturn(level1y, levelNow),
      ret3y: calculatePointReturn(level3y, levelNow),
      ret3yCA: level3y && levelNow ? (Math.pow(levelNow / level3y, 1 / 3) - 1) * 100 : null,
      ret5y: calculatePointReturn(level5y, levelNow),
      ret5yCA: level5y && levelNow ? (Math.pow(levelNow / level5y, 1 / 5) - 1) * 100 : null,
      usingFallback: !hist,
    };
  });

  const latestValue = stats?.totalValue ?? 0;
  const portRet1y = portfolioReturnFromSnapshots(snapshots, month1yAgo, latestValue);
  const portRet3y = portfolioReturnFromSnapshots(snapshots, month3yAgo, latestValue);
  const portRet5y = portfolioReturnFromSnapshots(snapshots, month5yAgo, latestValue);

  const portfolioRow = {
    ret1y: portRet1y,
    ret3y: portRet3y,
    ret3yCA: portRet3y != null ? (Math.pow(1 + portRet3y / 100, 1 / 3) - 1) * 100 : null,
    ret5y: portRet5y,
    ret5yCA: portRet5y != null ? (Math.pow(1 + portRet5y / 100, 1 / 5) - 1) * 100 : null,
    cagrEstimate: stats?.overallCagr ?? null,
    hasSnapData: portRet1y != null || portRet3y != null || portRet5y != null,
  };

  return {
    loading,
    error,
    benchmarkRows,
    portfolioRow,
    anyFallback: benchmarkRows.some(row => row.usingFallback),
    currentMonth,
  };
}
