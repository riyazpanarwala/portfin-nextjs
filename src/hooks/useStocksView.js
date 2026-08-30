'use client';

import { useMemo, useState } from 'react';
import { HOLDING_EPSILON, downloadCsv, useHoldingsViewState } from '@/hooks/useHoldingsViewState';

const stockSearchFields = [
  h => h.symbol,
  h => h.name,
  h => h.sector,
];

export function useStocksView({ stHoldings, stats }) {
  const [filter, setFilter] = useState('');
  const {
    sort, setSort, group: sector, setGroup: setSector, expanded, setExpanded,
    allExpanded, expandAll, collapseAll, toggleExpandAll,
    mode, setMode, activeHoldings, exitedHoldings,
    activeCount, exitedCount, dataErrorCount,
    groups: sectors, rows, maxRet, toggleSort, toggleExpanded,
  } = useHoldingsViewState({
    holdings: stHoldings,
    search: filter,
    searchFields: stockSearchFields,
  });

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
      h.qty <= HOLDING_EPSILON ? 'Exited' : 'Active',
      h.hasDataError ? 'YES' : '',
      daysSinceLastBuyMap[h.symbol] ?? '',
    ]));
    downloadCsv(`stocks_${mode}.csv`, rows2);
  }

  // Allocation data for Donut Chart
  const stockAllocationData = useMemo(() => {
    const total = activeHoldings.reduce((s, h) => s + h.marketValue, 0);
    if (!total) return [];
    return [...activeHoldings]
      .sort((a, b) => b.marketValue - a.marketValue)
      .map(h => ({
        label: h.symbol,
        value: h.marketValue,
        pct: (h.marketValue / total) * 100,
        assetType: 'STOCK',
      }));
  }, [activeHoldings]);

  return {
    sort, setSort, sector, setSector, filter, setFilter, expanded,
    allExpanded, expandAll, collapseAll, toggleExpandAll,
    mode, setMode,
    activeCount,
    exitedCount,
    dataErrorCount,
    concentrationMap,
    daysSinceLastBuyMap,
    stockAllocationData,
    sectors, rows, maxRet, stGain, stRealized, stWins, stLoss, stTotalEverInvested,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  };
}
