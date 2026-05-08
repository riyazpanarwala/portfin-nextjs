'use client';

import { useState, useMemo } from 'react';

const BENCHMARKS = [
  { name: 'Nifty 50',       cagr5y: 14.2, cagr3y: 12.8, cagr1y: 8.5 },
  { name: 'Sensex',         cagr5y: 13.9, cagr3y: 12.4, cagr1y: 8.1 },
  { name: 'Nifty Midcap',   cagr5y: 18.4, cagr3y: 17.2, cagr1y: 14.1 },
  { name: 'Nifty Smallcap', cagr5y: 22.1, cagr3y: 19.8, cagr1y: 16.5 },
];

export function useAnalyticsView({ stats, holdings, taxData, monthlyFlow, realizedSummary, portfolioXIRR }) {
  const [analyticsTab, setAnalyticsTab] = useState('overview');

  const ltcg         = useMemo(() => holdings.filter(h => h.years >= 1), [holdings]);
  const stcg         = useMemo(() => holdings.filter(h => h.years < 1),  [holdings]);
  const ltcgInvested = useMemo(() => ltcg.reduce((s, h) => s + h.invested, 0), [ltcg]);
  const stcgInvested = useMemo(() => stcg.reduce((s, h) => s + h.invested, 0), [stcg]);

  const flowBars = useMemo(() =>
    monthlyFlow.slice(-12).map(d => ({
      label: d.month.slice(5),
      value: d.amount,
      color: '#3b82f6',
    })),
    [monthlyFlow]
  );

  const sharpe = useMemo(() =>
    ((stats.overallCagr - 6.5) / 14).toFixed(2),
    [stats.overallCagr]
  );

  const unrealizedTax = useMemo(() =>
    taxData.reduce((s, h) => s + (h.tax || 0), 0),
    [taxData]
  );

  const returnMetrics = useMemo(() => [
    { label: 'Portfolio XIRR',    value: portfolioXIRR != null ? portfolioXIRR : null, color: 'var(--green2)',          sub: 'True money-weighted',  suffix: '%' },
    { label: 'Approx CAGR',       value: stats.overallCagr * 0.93,                    color: 'var(--accent2)',          sub: 'Time-weighted est.',   suffix: '%' },
    { label: 'Sharpe Ratio',      value: parseFloat(sharpe),                           color: 'var(--teal)',             sub: 'Risk-adjusted',        suffix: '' },
    { label: 'Unrealized Return', value: stats.totalReturnPct,                         color: null, /* colorPnl applied in component */ sub: 'Open positions', suffix: '%' },
    { label: 'Total Realized',    value: null, crValue: realizedSummary.totalRealized, color: null, sub: 'Closed positions' },
    { label: 'MF CAGR',           value: stats.mfCagr,                                color: 'var(--purple)',           sub: 'Weighted avg',         suffix: '%' },
  ], [stats, sharpe, realizedSummary, portfolioXIRR]);

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
    ltcg, stcg, ltcgInvested, stcgInvested,
    flowBars, sharpe, unrealizedTax,
    returnMetrics, sectorData, realizedSells,
    BENCHMARKS,
  };
}
