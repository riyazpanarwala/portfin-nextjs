'use client';

import { useState, useMemo } from 'react';
import { fmtCr, fmt } from '@/lib/store';

export function useMFView({ mfHoldings, stats }) {
  const [sort, setSort]         = useState({ key: 'returnPct', dir: -1 });
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState({});

  const categories = useMemo(() =>
    ['All', ...[...new Set(mfHoldings.map(h => h.sector || 'Other'))].sort()],
    [mfHoldings]
  );

  const rows = useMemo(() => {
    let list = category === 'All'
      ? [...mfHoldings]
      : mfHoldings.filter(h => (h.sector || 'Other') === category);
    const k = sort.key;
    list.sort((a, b) =>
      sort.dir * (k === 'lots' ? a.lots.length - b.lots.length : (a[k] ?? 0) - (b[k] ?? 0))
    );
    return list;
  }, [mfHoldings, category, sort]);

  const maxRet = useMemo(() =>
    Math.max(...mfHoldings.map(h => Math.abs(h.returnPct)), 1),
    [mfHoldings]
  );

  const mfGain = stats.mfValue - stats.mfInvested;

  const mfRealized = useMemo(() =>
    mfHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0),
    [mfHoldings]
  );

  // FIX (Issue 8): each item now carries an explicit `format` function so the
  // render loop never needs to infer the type of `v`.  Previously MFView used
  // `typeof m.v === 'number' && m.l !== 'Funds'` as a guard — fragile because
  // any label rename silently passes a plain integer into fmtCr(), which would
  // produce "₹5" instead of "5" for fund count.
  const summaryItems = useMemo(() => [
    {
      l: 'MF Value',
      v: stats.mfValue,
      c: 'var(--teal)',
      format: (v) => fmtCr(v),
    },
    {
      l: 'Invested',
      v: stats.mfInvested,
      c: 'var(--text)',
      format: (v) => fmtCr(v),
    },
    {
      l: 'Unrealized',
      v: mfGain,
      c: mfGain >= 0 ? 'var(--green2)' : 'var(--red2)',
      format: (v) => fmtCr(v),
    },
    {
      l: 'Realized P&L',
      v: mfRealized,
      c: mfRealized >= 0 ? 'var(--green2)' : 'var(--red2)',
      format: (v) => fmtCr(v),
    },
    {
      l: 'Wtd CAGR',
      v: stats.mfCagr,
      c: 'var(--green2)',
      // CAGR is a percentage, not a currency amount
      format: (v) => `${v >= 0 ? '+' : ''}${fmt(v)}%`,
    },
    {
      l: 'Funds',
      v: stats.fundCount,
      c: 'var(--accent2)',
      // Plain integer — no currency or percentage formatting
      format: (v) => String(v),
    },
  ], [stats, mfGain, mfRealized]);

  function toggleSort(k) {
    setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 });
  }

  function toggleExpanded(sym) {
    setExpanded(e => ({ ...e, [sym]: !e[sym] }));
  }

  function exportCSV(fmt) {
    const rows2 = [['Fund', 'Category', 'Lots', 'Units', 'CMP', 'Avg NAV', 'Invested', 'Value', 'Unrealized', 'Realized', 'Total Gain', 'Return%', 'CAGR', 'Holding']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector || '', h.lots.length, fmt(h.qty, 3), fmt(h.cmp, 2), fmt(h.avgBuy, 2),
      fmt(h.invested, 0), fmt(h.marketValue, 0), fmt(h.unrealizedGain, 0), fmt(h.realizedGain, 0),
      fmt(h.totalGain, 0), fmt(h.returnPct, 2) + '%', fmt(h.cagr, 2) + '%',
    ]));
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(rows2.map(r => r.join(',')).join('\n'));
    a.download = 'mf.csv';
    a.click();
  }

  return {
    sort, category, setCategory, expanded,
    categories, rows, maxRet, mfGain, mfRealized,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  };
}
