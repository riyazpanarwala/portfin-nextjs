'use client';

import { useState, useMemo } from 'react';

const EPSILON = 1e-6;

export function useStocksView({ stHoldings, stats }) {
  const [sort, setSort]         = useState({ key: 'returnPct', dir: -1 });
  const [sector, setSector]     = useState('All');
  const [filter, setFilter]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [mode, setMode]         = useState('active'); // 'active' | 'exited'

  // Split holdings: active = still holding qty; exited = fully sold
  const activeHoldings = useMemo(() => stHoldings.filter(h => h.qty > EPSILON),  [stHoldings]);
  const exitedHoldings = useMemo(() => stHoldings.filter(h => h.qty <= EPSILON), [stHoldings]);
  const sourceHoldings = mode === 'active' ? activeHoldings : exitedHoldings;

  const sectors = useMemo(() =>
    ['All', ...[...new Set(sourceHoldings.map(h => h.sector || 'Other'))].sort()],
    [sourceHoldings]
  );

  // Reset sector pill when mode changes — old sector may not exist in new list
  const effectiveSector = sectors.includes(sector) ? sector : 'All';

  const rows = useMemo(() => {
    let list = effectiveSector === 'All'
      ? [...sourceHoldings]
      : sourceHoldings.filter(h => (h.sector || 'Other') === effectiveSector);
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
  }, [sourceHoldings, effectiveSector, filter, sort]);

  const maxRet = useMemo(() =>
    Math.max(...sourceHoldings.map(h => Math.abs(h.returnPct)), 1),
    [sourceHoldings]
  );

  const stGain = useMemo(() => stats.stValue - stats.stInvested, [stats.stValue, stats.stInvested]);

  const stRealized = useMemo(() =>
    stHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0),
    [stHoldings]
  );

  const stWins = useMemo(() => stHoldings.reduce((s, h) => s + (h.stats?.winCount  || 0), 0), [stHoldings]);
  const stLoss = useMemo(() => stHoldings.reduce((s, h) => s + (h.stats?.lossCount || 0), 0), [stHoldings]);

  // Total ever invested across all stocks (including exited positions)
  const stTotalEverInvested = useMemo(() =>
    stHoldings.reduce((s, h) => s + (h.totalEverInvested ?? h.invested), 0),
    [stHoldings]
  );

  // Data error count
  const dataErrorCount = useMemo(() =>
    stHoldings.filter(h => h.hasDataError).length,
    [stHoldings]
  );

  // Concentration: per-holding weight within stock portfolio
  const concentrationMap = useMemo(() => {
    const total = activeHoldings.reduce((s, h) => s + h.marketValue, 0);
    const map = {};
    activeHoldings.forEach(h => {
      map[h.symbol] = total > 0 ? (h.marketValue / total) * 100 : 0;
    });
    return map;
  }, [activeHoldings]);

  // Days since last buy per holding
  const daysSinceLastBuyMap = useMemo(() => {
    const map = {};
    stHoldings.forEach(h => {
      if (!h.lots || !h.lots.length) { map[h.symbol] = null; return; }
      const lastLot = [...h.lots].sort((a, b) => b.date.localeCompare(a.date))[0];
      map[h.symbol] = Math.round((new Date() - new Date(lastLot.date)) / 864e5);
    });
    return map;
  }, [stHoldings]);

  const summaryItems = useMemo(() => [
    { l: 'Stock Value',    v: stats.stValue,             c: 'var(--purple)'  },
    { l: 'Invested',       v: stats.stInvested,          c: 'var(--text)'    },
    { l: 'Total Deployed', v: stTotalEverInvested,       c: 'var(--text2)',  sub: 'incl. exited' },
    { l: 'Unrealized',     v: stGain,                    c: stGain >= 0 ? 'var(--green2)' : 'var(--red2)' },
    { l: 'Realized P&L',   v: stRealized,                c: stRealized >= 0 ? 'var(--green2)' : 'var(--red2)' },
    { l: 'Total Gain',     v: stGain + stRealized,       c: (stGain + stRealized) >= 0 ? 'var(--green2)' : 'var(--red2)' },
    { l: 'Portfolio %',    v: `${(stats.stPct || 0).toFixed(1)}%`, c: 'var(--accent2)', sub: 'of total portfolio' },
    { l: 'W / L',          v: `${stWins}W / ${stLoss}L`, c: stWins > stLoss ? 'var(--green2)' : 'var(--red2)' },
    { l: 'Active',         v: activeHoldings.length,     c: 'var(--accent2)' },
    { l: 'Exited',         v: exitedHoldings.length,     c: 'var(--text3)'   },
  ], [stats, stGain, stRealized, stTotalEverInvested, stWins, stLoss, activeHoldings.length, exitedHoldings.length]);

  function toggleSort(k) {
    setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 });
  }

  function toggleExpanded(sym) {
    setExpanded(e => ({ ...e, [sym]: !e[sym] }));
  }

  function exportCSV(formatNum, formatHold) {
    const rows2 = [['Stock', 'Sector', 'Lots', 'Qty', 'CMP', 'Avg Buy', 'Invested', 'Total Deployed',
      'Value', 'Unrealized', 'Realized', 'Total Gain', 'Return%', 'CAGR', 'Holding', 'Portfolio%',
      'Status', 'Data Error', 'Days Since Last Buy']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector || '', h.lots.length, formatNum(h.qty, 0), formatNum(h.cmp, 2), formatNum(h.avgBuy, 2),
      formatNum(h.invested, 0), formatNum(h.totalEverInvested ?? h.invested, 0),
      formatNum(h.marketValue, 0), formatNum(h.unrealizedGain, 0), formatNum(h.realizedGain, 0),
      formatNum(h.totalGain, 0), formatNum(h.returnPct, 2) + '%', formatNum(h.cagr, 2) + '%',
      formatHold(h.holdingDays),
      formatNum(concentrationMap[h.symbol] ?? 0, 1) + '%',
      h.qty <= EPSILON ? 'Exited' : 'Active',
      h.hasDataError ? 'YES' : '',
      daysSinceLastBuyMap[h.symbol] ?? '',
    ]));
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(rows2.map(r => r.join(',')).join('\n'));
    a.download = `stocks_${mode}.csv`;
    a.click();
  }

  return {
    sort, sector: effectiveSector, setSector, filter, setFilter, expanded,
    mode, setMode,
    activeCount: activeHoldings.length,
    exitedCount: exitedHoldings.length,
    dataErrorCount,
    concentrationMap,
    daysSinceLastBuyMap,
    sectors, rows, maxRet, stGain, stRealized, stWins, stLoss, stTotalEverInvested,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  };
}
