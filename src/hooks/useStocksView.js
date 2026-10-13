'use client';

import { useMemo, useState } from 'react';
import { HOLDING_EPSILON, downloadCsv, useHoldingsViewState } from '@/hooks/useHoldingsViewState';
import { holdingKey, stockHoldingMetrics } from '@/lib/holdingIdentity';
import { decimalField, sumDecimal } from '@/lib/financialDecimal';

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
    rowKey: holdingKey,
  });

  const stGain = useMemo(() => decimalField(stats, 'stValue').minus(decimalField(stats, 'stInvested')).toNumber(), [stats]);

  const stRealized = useMemo(() =>
    sumDecimal(stHoldings, h => decimalField(h, 'realizedGain')).toNumber(),
    [stHoldings]
  );

  const stWins = useMemo(() => stHoldings.reduce((s, h) => s + (h.stats?.winCount  || 0), 0), [stHoldings]);
  const stLoss = useMemo(() => stHoldings.reduce((s, h) => s + (h.stats?.lossCount || 0), 0), [stHoldings]);

  // Total ever invested across all stocks (including exited positions)
  const stTotalEverInvested = useMemo(() =>
    sumDecimal(stHoldings, h => decimalField(h, h.totalEverInvested == null ? 'invested' : 'totalEverInvested')).toNumber(),
    [stHoldings]
  );

  // Concentration: per-holding weight within stock portfolio
  const { concentrationMap, daysSinceLastBuyMap } = useMemo(
    () => stockHoldingMetrics(activeHoldings, stHoldings),
    [activeHoldings, stHoldings]
  );

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
      'Status', 'Data Error', 'Days Since Last Buy', 'Exchange', 'Instrument ID']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector || '', h.lots.length, formatNum(h.qty, 0), formatNum(h.cmp, 2), formatNum(h.avgBuy, 2),
      formatNum(h.invested, 0), formatNum(h.totalEverInvested ?? h.invested, 0),
      formatNum(h.marketValue, 0), formatNum(h.unrealizedGain, 0), formatNum(h.realizedGain, 0),
      formatNum(h.totalGain, 0), formatNum(h.returnPct, 2) + '%', formatNum(h.cagr, 2) + '%',
      formatHold(h.holdingDays),
      formatNum(concentrationMap[holdingKey(h)] ?? 0, 1) + '%',
      h.qty <= HOLDING_EPSILON ? 'Exited' : 'Active',
      h.hasDataError ? 'YES' : '',
      daysSinceLastBuyMap[holdingKey(h)] ?? '', h.exchange || '', h.instrumentId || '',
    ]));
    downloadCsv(`stocks_${mode}.csv`, rows2);
  }

  // Allocation data for Donut Chart
  const stockAllocationData = useMemo(() => {
    const total = sumDecimal(activeHoldings, h => decimalField(h, 'marketValue'));
    if (total.isZero()) return [];
    const symbolCounts = new Map();
    for (const h of activeHoldings) symbolCounts.set(h.symbol, (symbolCounts.get(h.symbol) || 0) + 1);
    return [...activeHoldings]
      .sort((a, b) => b.marketValue - a.marketValue)
      .map(h => ({
        instrumentId: h.instrumentId,
        label: symbolCounts.get(h.symbol) > 1 ? `${h.symbol} (${h.exchange})` : h.symbol,
        value: h.marketValue,
        pct: decimalField(h, 'marketValue').div(total).times(100).toNumber(),
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
