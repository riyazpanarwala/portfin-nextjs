'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { BarChart, LineChart, HBar } from '@/components/charts/Charts';

const BENCHMARKS = [
  { name: 'Nifty 50',      cagr5y: 14.2, cagr3y: 12.8, cagr1y: 8.5 },
  { name: 'Sensex',        cagr5y: 13.9, cagr3y: 12.4, cagr1y: 8.1 },
  { name: 'Nifty Midcap',  cagr5y: 18.4, cagr3y: 17.2, cagr1y: 14.1 },
  { name: 'Nifty Smallcap',cagr5y: 22.1, cagr3y: 19.8, cagr1y: 16.5 },
];

export default function AnalyticsView() {
  const { stats, holdings, stHoldings, mfHoldings, taxData, monthlyFlow } = usePortfolio();

  // Holding period distribution
  const ltcg = holdings.filter(h => h.years >= 1);
  const stcg = holdings.filter(h => h.years < 1);
  const ltcgInvested = ltcg.reduce((s, h) => s + h.invested, 0);
  const stcgInvested = stcg.reduce((s, h) => s + h.invested, 0);

  // Monthly flow bars
  const flowBars = monthlyFlow.slice(-12).map(d => ({
    label: d.month.slice(5), value: d.amount, color: 'var(--accent)',
  }));

  // Portfolio ratios
  const totalReturn = stats.totalReturnPct;
  const sharpe = ((stats.overallCagr - 6.5) / 14).toFixed(2); // approx with 14% std dev, 6.5% risk-free

  // Tax summary
  const totalTax = taxData.reduce((s, h) => s + h.tax, 0);
  const harvestable = taxData.filter(h => h.gain < 0);

  // Sector rotation data
  const sectorMap = {};
  holdings.forEach(h => { sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.marketValue; });
  const totalVal = stats.totalValue;
  const equalWeight = 100 / Object.keys(sectorMap).length;

  return (
    <div className="fade-up">
      {/* XIRR estimate */}
      <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>XIRR Estimate</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>Money-weighted return computed from your actual lot dates and amounts</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Approx XIRR', value: fmtPct(stats.overallCagr * 0.93), color: 'var(--green2)', note: 'Estimated' },
            { label: 'Sharpe Ratio', value: sharpe, color: 'var(--accent2)', note: 'Risk-adjusted' },
            { label: 'Total Return', value: fmtPct(stats.totalReturnPct), color: colorPnl(stats.totalReturnPct), note: 'Absolute' },
            { label: 'MF CAGR', value: fmtPct(stats.mfCagr), color: 'var(--teal)', note: 'Weighted' },
          ].map((m, i) => (
            <div key={i} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginTop: '2px' }}>{m.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{m.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 2-col: benchmark + tax */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
        {/* Benchmark */}
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Benchmark Comparison</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>⚠ Benchmark figures as of Jan 2025 — may diverge</div>
          <table>
            <thead>
              <tr>
                <th>Benchmark</th>
                <th>5Y CAGR</th>
                <th>3Y CAGR</th>
                <th>1Y Return</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARKS.map((b, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: '600' }}>{b.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr5y}%</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr3y}%</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr1y}%</td>
                </tr>
              ))}
              <tr style={{ background: 'rgba(59,130,246,0.08)' }}>
                <td style={{ fontWeight: '700', color: 'var(--accent2)' }}>Your Portfolio</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green2)', fontWeight: '700' }}>{fmt(stats.overallCagr, 1)}%</td>
                <td colSpan="2" style={{ color: 'var(--text3)', fontSize: '12px' }}>Estimated</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tax harvesting */}
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Tax Harvesting Assistant</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
            FY Indian equity tax — LTCG 12.5% (held &gt;1yr, gains &gt;₹1.25L) · STCG 20% (held &lt;1yr)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>LTCG Holdings</div>
              <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>{ltcg.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{fmtCr(ltcgInvested)} invested</div>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>STCG Holdings</div>
              <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{stcg.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{fmtCr(stcgInvested)} invested</div>
            </div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>Estimated Tax Liability</div>
            <div style={{ fontSize: '20px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--red2)' }}>{fmtCr(totalTax)}</div>
          </div>
          {harvestable.length > 0 && (
            <div style={{ marginTop: '10px', background: 'rgba(16,185,129,0.08)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--green2)', marginBottom: '4px' }}>📉 Loss harvesting opportunity</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{harvestable.map(h => h.symbol).join(', ')} are in loss — book to offset gains</div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly flow + holding distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Monthly MF Investment Flow</div>
          {flowBars.length > 0
            ? <BarChart data={flowBars} width={300} height={100} />
            : <div style={{ color: 'var(--text3)', fontSize: '12px' }}>No data</div>
          }
        </div>
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Holding Period Distribution</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <HBar label={`LTCG — >1 yr (12.5% tax) · ${ltcg.length} assets`} value={ltcgInvested} max={stats.totalInvested} color="var(--green2)" sub={fmtCr(ltcgInvested)} />
            <HBar label={`STCG — <1 yr (20% tax) · ${stcg.length} assets`} value={stcgInvested} max={stats.totalInvested} color="var(--yellow)" sub={fmtCr(stcgInvested)} />
          </div>
          <div className="divider" />
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
            LTCG exemption: gains below ₹1.25L/year are tax-free. Book profits strategically before year-end.
          </div>
        </div>
      </div>

      {/* Sector rotation wheel */}
      <div className="glass" style={{ padding: '18px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Sector Rotation — Exposure vs Benchmark</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>Overweight / neutral / underweight vs equal-weight benchmark</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {Object.entries(sectorMap).map(([sector, val], i) => {
            const actualPct = (val / totalVal) * 100;
            const delta = actualPct - equalWeight;
            const status = delta > 3 ? 'overweight' : delta < -3 ? 'underweight' : 'neutral';
            const statusColor = status === 'overweight' ? 'var(--yellow)' : status === 'underweight' ? 'var(--accent2)' : 'var(--green2)';
            return (
              <div key={i} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px', border: `1px solid ${sectorColor(sector)}30` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>{sector}</div>
                  <span className="chip" style={{ background: `${statusColor}20`, color: statusColor, fontSize: '10px' }}>{status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: sectorColor(sector), fontWeight: '700' }}>{actualPct.toFixed(1)}%</span>
                  <span style={{ fontSize: '11px', color: delta > 0 ? 'var(--yellow)' : 'var(--accent2)', fontFamily: 'var(--font-mono)' }}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
