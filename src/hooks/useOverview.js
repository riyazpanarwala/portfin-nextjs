'use client';

import { useMemo } from 'react';
import { computeTaxHarvesting } from '@/lib/store';

/**
 * useOverview
 * Derives all computed data needed by OverviewView.
 * Keeps the component a pure presentational shell.
 */
export function useOverview({ stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR }) {

  const sectorMap = useMemo(() => {
    const map = {};
    holdings.filter(h => h.qty > 0 && h.marketValue > 0).forEach(h => {
      map[h.sector || 'Other'] = (map[h.sector || 'Other'] || 0) + h.marketValue;
    });
    return map;
  }, [holdings]);

  const mfCatMap = useMemo(() => {
    const map = {};
    mfHoldings.filter(h => h.qty > 0 && h.marketValue > 0).forEach(h => {
      map[h.sector || 'Other'] = (map[h.sector || 'Other'] || 0) + h.marketValue;
    });
    return map;
  }, [mfHoldings]);

  const stockSectorMap = useMemo(() => {
    const map = {};
    stHoldings.filter(h => h.qty > 0 && h.marketValue > 0).forEach(h => {
      map[h.sector || 'Other'] = (map[h.sector || 'Other'] || 0) + h.marketValue;
    });
    return map;
  }, [stHoldings]);

  const topMF = useMemo(() =>
    [...mfHoldings.filter(h => h.qty > 0)].sort((a, b) => b.returnPct - a.returnPct).slice(0, 4),
    [mfHoldings]
  );

  const topMFLaggards = useMemo(() =>
    [...mfHoldings.filter(h => h.qty > 0)].sort((a, b) => a.returnPct - b.returnPct).slice(0, 4),
    [mfHoldings]
  );

  const topSt = useMemo(() =>
    [...stHoldings.filter(h => h.qty > 0)].sort((a, b) => b.returnPct - a.returnPct).slice(0, 4),
    [stHoldings]
  );

  const topStLaggards = useMemo(() =>
    [...stHoldings.filter(h => h.qty > 0)].sort((a, b) => a.returnPct - b.returnPct).slice(0, 4),
    [stHoldings]
  );

  const healthScore = useMemo(() => Math.min(100, Math.round(
    (stats.totalReturnPct > 0 ? 30 : 10) +
    (stats.mfCagr > 12 ? 25 : stats.mfCagr > 8 ? 18 : 10) +
    (stats.fundCount >= 4 ? 20 : stats.fundCount >= 2 ? 14 : 6) +
    (stats.stockCount >= 5 ? 15 : stats.stockCount >= 2 ? 10 : 5) +
    (stats.mfPct >= 50 ? 10 : 5)
  )), [stats]);

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

  const harvestingData = useMemo(() =>
    computeTaxHarvesting(holdings, realizedSummary),
    [holdings, realizedSummary]
  );

  const alerts = useMemo(() => {
    const list = [];
    if (stats.stPct > 45)
      list.push({ type: 'warning', msg: `Direct equity is ${stats.stPct.toFixed(1)}% of portfolio — consider capping at 40%` });
    if (stats.mfCagr < 8 && stats.mfCagr > 0)
      list.push({ type: 'info', msg: 'MF CAGR below 8% — some funds may be underperforming' });
    if (stats.fundCount + stats.stockCount < 3 && stats.totalValue > 0)
      list.push({ type: 'warning', msg: 'Very concentrated portfolio — consider adding more holdings' });
    if (realizedSummary.totalTax > 0)
      list.push({ type: 'warning', msg: `Estimated tax liability of ₹${(realizedSummary.totalTax / 100000).toFixed(2)}L on realized gains` });
    if (harvestingData.potentialTaxSavings > 0)
      list.push({ type: 'info', msg: `Tax Harvesting: Potential tax savings of ₹${Math.round(harvestingData.potentialTaxSavings).toLocaleString('en-IN')} available by setting off losses` });
    if (stats.fundCount > 0 || stats.stockCount > 0)
      list.push({ type: 'success', msg: `${stats.fundCount} MF + ${stats.stockCount} stocks across your portfolio` });
    return list;
  }, [stats, realizedSummary, harvestingData]);

  const suggestedActions = useMemo(() => {
    const actions = [
      { icon: '📈', action: 'Continue SIP',      detail: 'Maintain existing SIP amounts and record fresh trades', actionType: 'trade', targetView: 'trade' },
      { icon: '⚖️', action: 'Review Allocation', detail: `MF at ${stats.mfPct.toFixed(1)}% — ideal range is 60–75%`, actionType: 'rebalance', targetView: 'rebalancer' },
      { icon: '💰', action: 'LTCG Planning',     detail: 'Book equity gains below ₹1.25L annually to stay tax-free', actionType: 'analytics', targetView: 'analytics' },
      { icon: '🔄', action: 'Rebalance Check',   detail: 'Use the Rebalancer tab to check if drift exceeds ±5%', actionType: 'rebalance', targetView: 'rebalancer' },
    ];
    if (harvestingData.candidateLots.length > 0) {
      actions.unshift({
        icon: '📉',
        action: 'Tax-Loss Harvest',
        detail: `Review ${harvestingData.candidateLots.length} lot(s) with ₹${Math.round(harvestingData.totalHarvestableLoss).toLocaleString('en-IN')} harvestable loss`,
        actionType: 'harvest',
        targetView: 'tax-harvest',
      });
    }
    return actions.slice(0, 4);
  }, [stats, harvestingData]);

  const recentSells = useMemo(() =>
    realizedSummary.sells.slice(-5).reverse(),
    [realizedSummary]
  );

  const combinedAllocationData = useMemo(() => {
    const active = holdings.filter(h => h.qty > 0 && h.marketValue > 0);
    const total = stats.totalValue || active.reduce((s, h) => s + h.marketValue, 0);
    if (!total) return [];
    return [...active]
      .sort((a, b) => b.marketValue - a.marketValue)
      .map(h => ({
        label: h.name || h.symbol,
        symbol: h.symbol,
        value: h.marketValue,
        pct: (h.marketValue / total) * 100,
        assetType: h.assetType,
      }));
  }, [holdings, stats.totalValue]);

  return {
    sectorMap,
    mfCatMap,
    stockSectorMap,
    topMF,
    topMFLaggards,
    topSt,
    topStLaggards,
    healthScore,
    donutData,
    combinedAllocationData,
    healthBars,
    hasSells,
    alerts,
    suggestedActions,
    recentSells,
    harvestingData,
  };
}
