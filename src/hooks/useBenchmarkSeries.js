'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BENCHMARKS,
  fetchBenchmarkHistory,
  getBenchmarkForMonth,
  getFDSeries,
  rebaseToIndex,
  resolveBenchmarkColor,
} from '@/lib/niftyData';

export function calculatePointReturn(start, end) {
  return start != null && end != null && start > 0
    ? ((end / start) - 1) * 100
    : null;
}

export function getShortBenchmarkLabel(bench) {
  return bench.label.split(' ').slice(0, 2).join(' ');
}

export function subtractMonths(monthStr, n) {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1 - n, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function mapSnapshotsToPortfolioSeries(snapshots) {
  return [...snapshots]
    .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt))
    .map(snapshot => ({
      month:     snapshot.snapshotAt.slice(0, 7),
      value:     parseFloat(snapshot.totalValue),
      invested:  parseFloat(snapshot.totalInvested),
      gain:      parseFloat(snapshot.totalGain),
      returnPct: parseFloat(snapshot.totalReturnPct),
      mfCagr:    snapshot.mfCagr != null ? parseFloat(snapshot.mfCagr) : null,
      stCagr:    snapshot.stCagr != null ? parseFloat(snapshot.stCagr) : null,
      date:      snapshot.snapshotAt,
    }));
}

function sameKeys(a, b) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function useBenchmarkSeries({
  snapshots,
  activeBenchKeys,
  fetchFromDate,
  resetOnStartDateChange = true,
}) {
  const stableBenchKeys = useMemo(
    () => activeBenchKeys.filter(key => BENCHMARKS[key]),
    [activeBenchKeys],
  );

  const [benchHistories, setBenchHistories] = useState({});
  const [pendingKeys, setPendingKeys]       = useState(new Set());
  const [benchError, setBenchError]         = useState(false);
  const prevFetchStartRef                   = useRef(null);
  const prevFetchedKeysRef                  = useRef([]);

  const portfolioSeries = useMemo(
    () => mapSnapshotsToPortfolioSeries(snapshots || []),
    [snapshots],
  );

  const firstSnapshotDate = portfolioSeries[0]?.date?.slice(0, 10);
  const latestSnapshotDate = portfolioSeries[portfolioSeries.length - 1]?.date?.slice(0, 10);
  const fetchStartDate = fetchFromDate || firstSnapshotDate;

  useEffect(() => {
    if (!fetchStartDate) return;

    const fetchKeys = stableBenchKeys.filter(key => key !== 'fd');
    const dateChanged = fetchStartDate !== prevFetchStartRef.current;
    const keysChanged = !sameKeys(fetchKeys, prevFetchedKeysRef.current);

    prevFetchStartRef.current = fetchStartDate;
    prevFetchedKeysRef.current = fetchKeys;

    const toFetch = dateChanged && resetOnStartDateChange
      ? fetchKeys
      : fetchKeys.filter(key => !(key in benchHistories));

    if (!keysChanged && !dateChanged && !toFetch.length) return;
    if (!toFetch.length) return;

    let cancelled = false;
    setBenchError(false);
    if (dateChanged && resetOnStartDateChange) setBenchHistories({});

    setPendingKeys(prev => {
      const next = new Set(prev);
      toFetch.forEach(key => next.add(key));
      return next;
    });

    Promise.all(
      toFetch.map(key =>
        fetchBenchmarkHistory(fetchStartDate, key).then(result => ({ key, result }))
      )
    ).then(results => {
      if (cancelled) return;

      let anyError = false;
      const updates = {};
      results.forEach(({ key, result }) => {
        if (result) { updates[key] = result; }
        else        { updates[key] = null; anyError = true; }
      });

      setBenchHistories(prev => ({ ...prev, ...updates }));
      setPendingKeys(prev => {
        const next = new Set(prev);
        toFetch.forEach(key => next.delete(key));
        return next;
      });
      if (anyError) setBenchError(true);
    });

    return () => { cancelled = true; };
  }, [benchHistories, fetchStartDate, resetOnStartDateChange, stableBenchKeys]);

  const benchLoading = pendingKeys.size > 0;

  const activeBenchSeries = useMemo(() => {
    return stableBenchKeys.map(key => {
      const bench = BENCHMARKS[key];
      let data;

      if (key === 'fd') {
        data = getFDSeries(portfolioSeries).map(d => ({ month: d.month, value: d.value }));
      } else {
        const history = benchHistories[key]?.history ?? null;
        data = portfolioSeries
          .map(d => ({
            month: d.month,
            value: getBenchmarkForMonth(d.month, history, key) ?? null,
          }))
          .filter(d => d.value !== null);
      }

      return {
        key,
        label:      bench.label,
        shortLabel: getShortBenchmarkLabel(bench),
        color:      bench.color,
        hexColor:   resolveBenchmarkColor(bench.color),
        data,
        pending:    pendingKeys.has(key),
      };
    });
  }, [stableBenchKeys, benchHistories, portfolioSeries, pendingKeys]);

  const rebasedPortfolio = useMemo(() => {
    if (!portfolioSeries.length) return [];
    return rebaseToIndex(portfolioSeries, portfolioSeries[0].value);
  }, [portfolioSeries]);

  const rebasedBenchSeries = useMemo(() => {
    return activeBenchSeries
      .filter(benchmark => benchmark.data.length > 0)
      .map(benchmark => ({
        ...benchmark,
        data: benchmark.key === 'fd'
          ? benchmark.data.map(d => ({ ...d, indexed: d.value }))
          : rebaseToIndex(benchmark.data, benchmark.data[0].value),
      }));
  }, [activeBenchSeries]);

  const pTotal = portfolioSeries.length >= 2
    ? (portfolioSeries[portfolioSeries.length - 1]?.returnPct ?? 0)
    : 0;

  const primaryBench = activeBenchSeries[0];
  const bTotal = primaryBench?.data?.length
    ? calculatePointReturn(
        primaryBench.data[0]?.value || 1,
        primaryBench.data[primaryBench.data.length - 1]?.value || 1,
      )
    : 0;

  const alphaReturnPct = primaryBench ? pTotal - bTotal : null;
  const lastPortfolioPoint = rebasedPortfolio[rebasedPortfolio.length - 1];
  const lastPrimaryBenchPoint = primaryBench
    ? rebasedBenchSeries.find(benchmark => benchmark.key === primaryBench.key)?.data?.slice(-1)[0]
    : null;
  const alphaIndexPts = lastPortfolioPoint && lastPrimaryBenchPoint
    ? lastPortfolioPoint.indexed - lastPrimaryBenchPoint.indexed
    : null;

  const exportComparisonCSV = useCallback(() => {
    const benchMaps = rebasedBenchSeries.map(benchmark =>
      Object.fromEntries(benchmark.data.map(d => [d.month, d.indexed]))
    );
    const headers = [
      'Month',
      'Portfolio (indexed)',
      ...activeBenchSeries.map(benchmark => `${benchmark.label} (indexed)`),
    ];
    const rows = rebasedPortfolio.map(d => [
      d.month,
      d.indexed?.toFixed(2) ?? '',
      ...rebasedBenchSeries.map((benchmark, index) => {
        const value = benchMaps[index][d.month];
        return value != null ? value.toFixed(2) : '';
      }),
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const link = document.createElement('a');
    link.href = 'data:text/csv,' + encodeURIComponent(csv);
    link.download = 'portfolio_vs_benchmarks.csv';
    link.click();
  }, [activeBenchSeries, rebasedBenchSeries, rebasedPortfolio]);

  return {
    activeBenchSeries,
    alphaIndexPts,
    alphaReturnPct,
    benchError,
    benchHistories,
    benchLoading,
    bTotal,
    exportComparisonCSV,
    firstSnapshotDate,
    latestSnapshotDate,
    pendingKeys,
    portfolioSeries,
    primaryBench,
    pTotal,
    rebasedBenchSeries,
    rebasedPortfolio,
  };
}
