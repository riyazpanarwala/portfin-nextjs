'use client';

import { useState, useMemo } from 'react';

export function useAnalyticsView({ stats, holdings, taxData, monthlyFlow, realizedSummary, portfolioXIRR, portfolioBeta }) {
  const [analyticsTab, setAnalyticsTab] = useState('overview');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const ltcg         = useMemo(() => holdings.filter(h => h.years >= 1), [holdings]);
  const stcg         = useMemo(() => holdings.filter(h => h.years < 1),  [holdings]);
  const ltcgInvested = useMemo(() => ltcg.reduce((s, h) => s + h.invested, 0), [ltcg]);
  const stcgInvested = useMemo(() => stcg.reduce((s, h) => s + h.invested, 0), [stcg]);

  const sharpe = useMemo(() =>
    ((stats.overallCagr - 6.5) / 14).toFixed(2),
    [stats.overallCagr]
  );

  const unrealizedTax = useMemo(() =>
    taxData.reduce((s, h) => s + (h.tax || 0), 0),
    [taxData]
  );

  const returnMetrics = useMemo(() => [
    { label: 'Portfolio XIRR',    value: portfolioXIRR != null ? portfolioXIRR : null, color: 'var(--green2)',          sub: 'True money-weighted',  suffix: '%', target: 'cagr' },
    { label: 'Portfolio Beta',    value: portfolioBeta?.beta ?? null,                    color: 'var(--yellow)',          sub: 'Weighted equity risk', suffix: '', target: 'concentration' },
    { label: 'Portfolio CAGR',    value: stats.overallCagr,                            color: 'var(--accent2)',          sub: 'Annualized growth',    suffix: '%', target: 'rolling' },
    { label: 'Sharpe Ratio',      value: parseFloat(sharpe),                           color: 'var(--teal)',             sub: 'Est. (Rf = 6.5%)',     suffix: '', target: 'concentration' },
    { label: 'Unrealized Return', value: stats.totalReturnPct,                         color: null, /* colorPnl applied in component */ sub: 'Open positions', suffix: '%', target: 'cagr' },
    { label: 'Total Realized',    value: null, crValue: realizedSummary.totalRealized, color: null, sub: 'Closed positions', target: 'realized' },
    { label: 'MF CAGR',           value: stats.mfCagr,                                color: 'var(--purple)',           sub: 'Weighted avg',         suffix: '%', target: 'cagr' },
    { label: 'Stock CAGR',        value: stats.stCagr,                                color: 'var(--teal)',             sub: 'Weighted avg',         suffix: '%', target: 'cagr' },
  ], [stats, sharpe, realizedSummary, portfolioXIRR, portfolioBeta]);

  const sectorData = useMemo(() => {
    const map = {};
    holdings.forEach(h => {
      const sec = h.sector || 'Other';
      if (!map[sec]) map[sec] = { val: 0, invested: 0, mfVal: 0, stVal: 0, mfInvested: 0, stInvested: 0 };
      map[sec].val      += h.marketValue;
      map[sec].invested += h.invested;
      if (h.assetType === 'MF') { map[sec].mfVal += h.marketValue; map[sec].mfInvested += h.invested; }
      else                      { map[sec].stVal += h.marketValue; map[sec].stInvested += h.invested; }
    });
    const totalVal    = stats.totalValue || 1;
    const sectorCount = Object.keys(map).length;
    const equalWeight = sectorCount > 0 ? 100 / sectorCount : 0;
    const sectors = Object.entries(map)
      .map(([label, d]) => ({ label, ...d, pct: (d.val / totalVal) * 100, delta: (d.val / totalVal) * 100 - equalWeight }))
      .sort((a, b) => b.pct - a.pct);
    return { sectors, equalWeight, sectorCount };
  }, [holdings, stats.totalValue]);

  const realizedSells = useMemo(() => {
    const sells = realizedSummary.sells;
    const winSells  = sells.filter(s => s.realized > 0);
    const lossSells = sells.filter(s => s.realized < 0);
    const winRate   = sells.length > 0 ? (winSells.length / sells.length) * 100 : 0;
    const avgWin    = winSells.length  > 0 ? winSells.reduce((s, x) => s + x.realized, 0) / winSells.length  : 0;
    const avgLoss   = lossSells.length > 0 ? lossSells.reduce((s, x) => s + x.realized, 0) / lossSells.length : 0;
    return { sells, winSells, lossSells, winRate, avgWin, avgLoss };
  }, [realizedSummary]);

  return {
    analyticsTab, setAnalyticsTab,
    categoryFilter, setCategoryFilter,
    ltcg, stcg, ltcgInvested, stcgInvested,
    sharpe, unrealizedTax,
    returnMetrics, sectorData, realizedSells,
  };
}
