import { useMemo, useState } from 'react';
import { fmtCr, fmt } from '@/lib/store';
import { HOLDING_EPSILON, downloadCsv, useHoldingsViewState } from '@/hooks/useHoldingsViewState';

const mfSearchFields = [
  h => h.name,
  h => h.symbol,
  h => h.sector,
];

export function useMFView({ mfHoldings, stats }) {
  const [filter, setFilter] = useState('');
  const {
    sort, setSort, group: category, setGroup: setCategory, expanded, setExpanded,
    allExpanded, expandAll, collapseAll, toggleExpandAll,
    mode, setMode, activeHoldings, exitedHoldings,
    activeCount, exitedCount, dataErrorCount,
    groups: categories, rows, maxRet, toggleSort, toggleExpanded,
  } = useHoldingsViewState({
    holdings: mfHoldings,
    search: filter,
    searchFields: mfSearchFields,
  });

  const mfGain = stats.mfValue - stats.mfInvested;

  const mfRealized = useMemo(() =>
    mfHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0),
    [mfHoldings]
  );

  const mfWins = useMemo(() =>
    activeHoldings.filter(h => (h.unrealizedGain ?? h.gain ?? 0) >= 0).length,
    [activeHoldings]
  );

  const mfLoss = useMemo(() =>
    activeHoldings.filter(h => (h.unrealizedGain ?? h.gain ?? 0) < 0).length,
    [activeHoldings]
  );

  // Concentration: per-holding weight within active MF portfolio
  const concentrationMap = useMemo(() => {
    const total = activeHoldings.reduce((s, h) => s + h.marketValue, 0);
    const map = {};
    activeHoldings.forEach(h => {
      map[h.symbol] = total > 0 ? (h.marketValue / total) * 100 : 0;
    });
    return map;
  }, [activeHoldings]);

  // Total ever invested across all MF (including exited positions)
  const mfTotalEverInvested = useMemo(() =>
    mfHoldings.reduce((s, h) => s + (h.totalEverInvested ?? h.invested), 0),
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
      l: 'W / L',
      v: `${mfWins}W / ${mfLoss}L`,
      c: mfWins >= mfLoss ? 'var(--green2)' : 'var(--red2)',
      format: v => String(v),
      sub: 'gainers / draggers',
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
  ], [stats, mfGain, mfRealized, mfTotalEverInvested, mfWins, mfLoss, activeHoldings.length, exitedHoldings.length]);

  function exportCSV(formatNum) {
    const rows2 = [['Fund', 'Category', 'Lots', 'Units', 'CMP', 'Avg NAV', 'Invested', 'Total Deployed',
      'Value', 'Unrealized', 'Realized', 'Total Gain', 'Return%', 'CAGR', 'Portfolio%', 'Status', 'Data Error']];
    rows.forEach(h => rows2.push([
      h.name || h.symbol, h.sector || '', h.lots.length, formatNum(h.qty, 3), formatNum(h.cmp, 2), formatNum(h.avgBuy, 2),
      formatNum(h.invested, 0), formatNum(h.totalEverInvested ?? h.invested, 0),
      formatNum(h.marketValue, 0), formatNum(h.unrealizedGain, 0), formatNum(h.realizedGain, 0),
      formatNum(h.totalGain, 0), formatNum(h.returnPct, 2) + '%', formatNum(h.cagr, 2) + '%',
      formatNum(concentrationMap[h.symbol] ?? 0, 1) + '%',
      h.qty <= HOLDING_EPSILON ? 'Exited' : 'Active',
      h.hasDataError ? 'YES' : '',
    ]));
    downloadCsv(`mf_${mode}.csv`, rows2);
  }

  // Allocation data for Donut Chart
  const mfAllocationData = useMemo(() => {
    const total = activeHoldings.reduce((s, h) => s + h.marketValue, 0);
    if (!total) return [];
    return [...activeHoldings]
      .sort((a, b) => b.marketValue - a.marketValue)
      .map(h => ({
        label: h.name || h.symbol,
        value: h.marketValue,
        pct: (h.marketValue / total) * 100,
        assetType: 'MF',
      }));
  }, [activeHoldings]);

  return {
    sort, setSort, category, setCategory, filter, setFilter, expanded,
    allExpanded, expandAll, collapseAll, toggleExpandAll,
    mode, setMode,
    activeCount,
    exitedCount,
    dataErrorCount,
    concentrationMap,
    mfAllocationData,
    categories, rows, maxRet, mfGain, mfRealized, mfTotalEverInvested, mfWins, mfLoss,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  };
}
