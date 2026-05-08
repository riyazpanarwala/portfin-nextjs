'use client';

import { useState, useMemo } from 'react';

export function useStocksView({ stHoldings, stats }) {
  const [sort, setSort]         = useState({ key: 'returnPct', dir: -1 });
  const [sector, setSector]     = useState('All');
  const [filter, setFilter]     = useState('');
  const [expanded, setExpanded] = useState({});

  const sectors = useMemo(() =>
    ['All', ...[...new Set(stHoldings.map(h => h.sector || 'Other'))].sort()],
    [stHoldings]
  );

  const rows = useMemo(() => {
    let list = sector === 'All'
      ? [...stHoldings]
      : stHoldings.filter(h => (h.sector || 'Other') === sector);
    if (filter)
      list = list.filter(h =>
        h.symbol.toLowerCase().includes(filter.toLowerCase()) ||
        (h.sector || '').toLowerCase().includes(filter.toLowerCase())
      );
    const k = sort.key;
    list.sort((a, b) =>
      sort.dir * (k === 'lots' ? a.lots.length - b.lots.length : (a[k] ?? 0) - (b[k] ?? 0))
    );
    return list;
  }, [stHoldings, sector, filter, sort]);

  const maxRet = useMemo(() =>
    Math.max(...stHoldings.map(h => Math.abs(h.returnPct)), 1),
    [stHoldings]
  );

  const stGain = stats.stValue - stats.stInvested;

  const stRealized = useMemo(() =>
    stHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0),
    [stHoldings]
  );

  const stWins = stHoldings.reduce((s, h) => s + (h.stats?.winCount  || 0), 0);
  const stLoss = stHoldings.reduce((s, h) => s + (h.stats?.lossCount || 0), 0);

  const summaryItems = useMemo(() => [
    { l: 'Stock Value',   v: stats.stValue,             c: 'var(--purple)'  },
    { l: 'Invested',      v: stats.stInvested,          c: 'var(--text)'    },
    { l: 'Unrealized',    v: stGain,                    c: stGain >= 0 ? 'var(--green2)' : 'var(--red2)' },
    { l: 'Realized P&L', v: stRealized,                c: stRealized >= 0 ? 'var(--green2)' : 'var(--red2)' },
    { l: 'Total Gain',    v: stGain + stRealized,       c: (stGain + stRealized) >= 0 ? 'var(--green2)' : 'var(--red2)' },
    { l: 'W / L',         v: `${stWins}W / ${stLoss}L`, c: stWins > stLoss ? 'var(--green2)' : 'var(--red2)' },
    { l: 'Stocks',        v: stats.stockCount,          c: 'var(--accent2)' },
  ], [stats, stGain, stRealized, stWins, stLoss]);

  function toggleSort(k) {
    setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 });
  }

  function toggleExpanded(sym) {
    setExpanded(e => ({ ...e, [sym]: !e[sym] }));
  }

  function exportCSV(fmt, holdStr) {
    const rows2 = [['Stock', 'Sector', 'Lots', 'Qty', 'CMP', 'Avg Buy', 'Invested', 'Value', 'Unrealized', 'Realized', 'Total Gain', 'Return%', 'CAGR', 'Holding']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector || '', h.lots.length, fmt(h.qty, 0), fmt(h.cmp, 2), fmt(h.avgBuy, 2),
      fmt(h.invested, 0), fmt(h.marketValue, 0), fmt(h.unrealizedGain, 0), fmt(h.realizedGain, 0),
      fmt(h.totalGain, 0), fmt(h.returnPct, 2) + '%', fmt(h.cagr, 2) + '%', holdStr(h.holdingDays),
    ]));
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(rows2.map(r => r.join(',')).join('\n'));
    a.download = 'stocks.csv';
    a.click();
  }

  return {
    sort, sector, setSector, filter, setFilter, expanded,
    sectors, rows, maxRet, stGain, stRealized, stWins, stLoss,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  };
}
