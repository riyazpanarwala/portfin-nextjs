'use client';

import { useMemo } from 'react';

/**
 * useOverview
 * Derives all computed data needed by OverviewView.
 * Keeps the component a pure presentational shell.
 */
export function useOverview({ stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR }) {

  const sectorMap = useMemo(() => {
    const map = {};
    holdings.forEach(h => {
      map[h.sector || 'Other'] = (map[h.sector || 'Other'] || 0) + h.marketValue;
    });
    return map;
  }, [holdings]);

  const mfCatMap = useMemo(() => {
    const map = {};
    mfHoldings.forEach(h => {
      map[h.sector || 'Other'] = (map[h.sector || 'Other'] || 0) + h.marketValue;
    });
    return map;
  }, [mfHoldings]);

  const topMF = useMemo(() =>
    [...mfHoldings].sort((a, b) => b.returnPct - a.returnPct).slice(0, 4),
    [mfHoldings]
  );

  const topSt = useMemo(() =>
    [...stHoldings].sort((a, b) => b.returnPct - a.returnPct).slice(0, 4),
    [stHoldings]
  );

  const healthScore = useMemo(() => Math.min(100, Math.round(
    (stats.totalReturnPct > 0 ? 30 : 10) +
    (stats.mfCagr > 12 ? 25 : stats.mfCagr > 8 ? 18 : 10) +
    (stats.fundCount >= 4 ? 20 : stats.fundCount >= 2 ? 14 : 6) +
    (stats.stockCount >= 5 ? 15 : stats.stockCount >= 2 ? 10 : 5) +
    (stats.mfPct >= 50 ? 10 : 5)
  )), [stats]);

  const priceSymbols = useMemo(() => Object.keys(currentPrices), [currentPrices]);

  const donutData = useMemo(() => [
    { label: 'Mutual Funds', value: stats.mfValue, color: '#38bdf8', pct: stats.mfPct },
    { label: 'Stocks',       value: stats.stValue,  color: '#a78bfa', pct: stats.stPct },
  ].filter(d => d.value > 0), [stats]);

  const healthBars = useMemo(() => [
    { label: 'Diversification',  pct: Math.min(100, (stats.fundCount + stats.stockCount) * 10) },
    { label: 'Risk balance',     pct: stats.mfPct >= 50 && stats.mfPct <= 80 ? 85 : 60 },
    { label: 'Return quality',   pct: stats.overallCagr > 12 ? 90 : stats.overallCagr > 8 ? 70 : 50 },
    { label: 'Allocation focus', pct: stats.fundCount > 0 && stats.stockCount > 0 ? 80 : 50 },
  ], [stats]);

  const hasSells = realizedSummary.sells.length > 0;

  const alerts = useMemo(() => {
    const list = [];
    if (stats.stPct > 45)
      list.push({ type: 'warning', msg: `Direct equity is ${stats.stPct.toFixed(1)}% of portfolio — consider capping at 40%` });
    if (stats.mfCagr < 8 && stats.mfCagr > 0)
      list.push({ type: 'info', msg: 'MF CAGR below 8% — some funds may be underperforming' });
    if (stats.fundCount + stats.stockCount < 3)
      list.push({ type: 'warning', msg: 'Very concentrated portfolio — consider adding more holdings' });
    if (realizedSummary.totalTax > 0)
      list.push({ type: 'warning', msg: `Estimated tax liability of ₹${(realizedSummary.totalTax / 100000).toFixed(2)}L on realized gains` });
    list.push({ type: 'success', msg: `${stats.fundCount} MF + ${stats.stockCount} stocks across your portfolio` });
    return list;
  }, [stats, realizedSummary]);

  const suggestedActions = useMemo(() => [
    { icon: '📈', action: 'Continue SIP',      detail: 'Maintain existing SIP amounts and review after 6 months' },
    { icon: '⚖️', action: 'Review Allocation', detail: `MF at ${stats.mfPct.toFixed(1)}% — ideal range is 60–75%` },
    { icon: '💰', action: 'LTCG Planning',     detail: 'Book equity gains below ₹1.25L annually to stay tax-free' },
    { icon: '🔄', action: 'Rebalance Check',   detail: 'Use the Rebalancer tab to check if drift exceeds ±5%' },
  ], [stats]);

  const recentSells = useMemo(() =>
    realizedSummary.sells.slice(-5).reverse(),
    [realizedSummary]
  );

  return {
    sectorMap, mfCatMap, topMF, topSt, healthScore,
    priceSymbols, donutData, healthBars, hasSells,
    alerts, suggestedActions, recentSells,
  };
}
