'use client';

import { useState, useMemo } from 'react';
import { fmtCr, fmt } from '@/lib/store';

const EPSILON = 1e-6;

export function useMFView({ mfHoldings, stats }) {
  const [sort, setSort]         = useState({ key: 'returnPct', dir: -1 });
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState({});
  const [mode, setMode]         = useState('active'); // 'active' | 'exited'

  // Split holdings: active = still holding units; exited = fully redeemed
  const activeHoldings = useMemo(() => mfHoldings.filter(h => h.qty > EPSILON),  [mfHoldings]);
  const exitedHoldings = useMemo(() => mfHoldings.filter(h => h.qty <= EPSILON), [mfHoldings]);
  const sourceHoldings = mode === 'active' ? activeHoldings : exitedHoldings;

  const categories = useMemo(() =>
    ['All', ...[...new Set(sourceHoldings.map(h => h.sector || 'Other'))].sort()],
    [sourceHoldings]
  );

  // Reset category pill when mode changes
  const effectiveCategory = categories.includes(category) ? category : 'All';

  const rows = useMemo(() => {
    let list = effectiveCategory === 'All'
      ? [...sourceHoldings]
      : sourceHoldings.filter(h => (h.sector || 'Other') === effectiveCategory);
    const k = sort.key;
    list.sort((a, b) =>
      sort.dir * (k === 'lots' ? a.lots.length - b.lots.length : (a[k] ?? 0) - (b[k] ?? 0))
    );
    return list;
  }, [sourceHoldings, effectiveCategory, sort]);

  const maxRet = useMemo(() =>
    Math.max(...sourceHoldings.map(h => Math.abs(h.returnPct)), 1),
    [sourceHoldings]
  );

  const mfGain = stats.mfValue - stats.mfInvested;

  const mfRealized = useMemo(() =>
    mfHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0),
    [mfHoldings]
  );

  // Total ever invested across all MF (including exited positions)
  const mfTotalEverInvested = useMemo(() =>
    mfHoldings.reduce((s, h) => s + (h.totalEverInvested ?? h.invested), 0),
    [mfHoldings]
  );

  // Data error count
  const dataErrorCount = useMemo(() =>
    mfHoldings.filter(h => h.hasDataError).length,
    [mfHoldings]
  );

  const summaryItems = useMemo(() => [
    {
      l: 'MF Value',
      v: stats.mfValue,
      c: 'var(--teal)',
      format: v => fmtCr(v),
    },
    {
      l: 'Invested',
      v: stats.mfInvested,
      c: 'var(--text)',
      format: v => fmtCr(v),
    },
    {
      l: 'Total Deployed',
      v: mfTotalEverInvested,
      c: 'var(--text2)',
      format: v => fmtCr(v),
      sub: 'incl. exited',
    },
    {
      l: 'Unrealized',
      v: mfGain,
      c: mfGain >= 0 ? 'var(--green2)' : 'var(--red2)',
      format: v => fmtCr(v),
    },
    {
      l: 'Realized P&L',
      v: mfRealized,
      c: mfRealized >= 0 ? 'var(--green2)' : 'var(--red2)',
      format: v => fmtCr(v),
    },
    {
      l: 'Wtd CAGR',
      v: stats.mfCagr,
      c: 'var(--green2)',
      format: v => `${v >= 0 ? '+' : ''}${fmt(v)}%`,
    },
    {
      l: 'Portfolio %',
      v: stats.mfPct,
      c: 'var(--accent2)',
      format: v => `${fmt(v, 1)}%`,
      sub: 'of total portfolio',
    },
    {
      l: 'Active',
      v: activeHoldings.length,
      c: 'var(--accent2)',
      format: v => String(v),
    },
    {
      l: 'Exited',
      v: exitedHoldings.length,
      c: 'var(--text3)',
      format: v => String(v),
    },
  ], [stats, mfGain, mfRealized, mfTotalEverInvested, activeHoldings.length, exitedHoldings.length]);

  function toggleSort(k) {
    setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 });
  }

  function toggleExpanded(sym) {
    setExpanded(e => ({ ...e, [sym]: !e[sym] }));
  }

  function exportCSV(fmt) {
    const rows2 = [['Fund', 'Category', 'Lots', 'Units', 'CMP', 'Avg NAV', 'Invested', 'Total Deployed',
      'Value', 'Unrealized', 'Realized', 'Total Gain', 'Return%', 'CAGR', 'Status', 'Data Error']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector || '', h.lots.length, fmt(h.qty, 3), fmt(h.cmp, 2), fmt(h.avgBuy, 2),
      fmt(h.invested, 0), fmt(h.totalEverInvested ?? h.invested, 0),
      fmt(h.marketValue, 0), fmt(h.unrealizedGain, 0), fmt(h.realizedGain, 0),
      fmt(h.totalGain, 0), fmt(h.returnPct, 2) + '%', fmt(h.cagr, 2) + '%',
      h.qty <= EPSILON ? 'Exited' : 'Active',
      h.hasDataError ? 'YES' : '',
    ]));
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(rows2.map(r => r.join(',')).join('\n'));
    a.download = `mf_${mode}.csv`;
    a.click();
  }

  return {
    sort, category: effectiveCategory, setCategory, expanded,
    mode, setMode,
    activeCount: activeHoldings.length,
    exitedCount: exitedHoldings.length,
    dataErrorCount,
    categories, rows, maxRet, mfGain, mfRealized, mfTotalEverInvested,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  };
}
