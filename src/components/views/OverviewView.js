'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { DonutChart, HBar, Sparkline } from '@/components/charts/Charts';
import { StatCard, Alert } from '@/components/ui/SharedUI';

export default function OverviewView() {
  const { stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR } = usePortfolio();

  const sectorMap = {};
  holdings.forEach(h => { sectorMap[h.sector || 'Other'] = (sectorMap[h.sector || 'Other'] || 0) + h.marketValue; });

  const mfCatMap = {};
  mfHoldings.forEach(h => { mfCatMap[h.sector || 'Other'] = (mfCatMap[h.sector || 'Other'] || 0) + h.marketValue; });

  const topMF = [...mfHoldings].sort((a, b) => b.returnPct - a.returnPct).slice(0, 4);
  const topSt = [...stHoldings].sort((a, b) => b.returnPct - a.returnPct).slice(0, 4);

  const healthScore = Math.min(100, Math.round(
    (stats.totalReturnPct > 0 ? 30 : 10) +
    (stats.mfCagr > 12 ? 25 : stats.mfCagr > 8 ? 18 : 10) +
    (stats.fundCount >= 4 ? 20 : stats.fundCount >= 2 ? 14 : 6) +
    (stats.stockCount >= 5 ? 15 : stats.stockCount >= 2 ? 10 : 5) +
    (stats.mfPct >= 50 ? 10 : 5)
  ));

  const priceSymbols = Object.keys(currentPrices);
  const hasSells = realizedSummary.sells.length > 0;

  return (
    <div className="fade-up">
      {/* Live price notice */}
      {priceSymbols.length > 0 && (
        <div style={{ marginBottom: '14px', padding: '8px 14px', background: 'rgba(16,185,129,0.08)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)', fontSize: '12px', color: 'var(--green2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="live-dot" />
          Prices fetched for {priceSymbols.length} symbol{priceSymbols.length > 1 ? 's' : ''}: {priceSymbols.join(', ')}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="Total Value"       value={fmtCr(stats.totalValue)}          sub="Portfolio"                           color="var(--accent2)" valueSize={20} />
        <StatCard label="Total Invested"    value={fmtCr(stats.totalInvested)}        sub="Capital deployed"                    color="var(--text2)"   valueSize={20} />
        <StatCard label="Total Gain"        value={fmtCr(stats.totalGain)}            sub={fmtPct(stats.totalReturnPct, true)}  color={colorPnl(stats.totalGain)} valueSize={20} />
        <StatCard label="Unrealized P&L"   value={fmtCr(stats.totalUnrealizedGain)}  sub="Open positions"                      color={colorPnl(stats.totalUnrealizedGain)} valueSize={20} />
        <StatCard label="Realized P&L"     value={fmtCr(stats.totalRealizedGain)}    sub={`${realizedSummary.sells.length} sell${realizedSummary.sells.length !== 1 ? 's' : ''}`} color={colorPnl(stats.totalRealizedGain)} valueSize={20} />
        <StatCard label="Overall CAGR"      value={fmtPct(stats.overallCagr)}         sub="Annualised"                          color="var(--green2)"  valueSize={20} />
        {portfolioXIRR != null && (
          <StatCard label="Portfolio XIRR" value={fmtPct(portfolioXIRR)}             sub="Money-weighted"                      color="var(--teal)"    valueSize={20} />
        )}
        <StatCard label="MF Value"          value={fmtCr(stats.mfValue)}              sub={`${fmt(stats.mfPct, 1)}% of portfolio`} color="var(--teal)"  valueSize={20} />
        <StatCard label="Stock Value"       value={fmtCr(stats.stValue)}              sub={`${fmt(stats.stPct, 1)}% of portfolio`} color="var(--purple)" valueSize={20} />
      </div>

      {/* Realized P&L panel */}
      {hasSells && (
        <div className="glass" style={{ padding: '18px', marginBottom: '20px', background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(20,184,166,0.03))', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💰</span> Realized P&amp;L Summary
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Total Realized',    value: fmtCr(realizedSummary.totalRealized), color: colorPnl(realizedSummary.totalRealized) },
              { label: 'LTCG Gain',         value: fmtCr(realizedSummary.ltcgGain),      color: 'var(--green2)', sub: '12.5% tax rate' },
              { label: 'STCG Gain',         value: fmtCr(realizedSummary.stcgGain),      color: 'var(--yellow)', sub: '20% tax rate' },
              { label: 'Est. Tax Liability',value: fmtCr(realizedSummary.totalTax),      color: 'var(--red2)',   sub: 'FY estimate' },
            ].map((m, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{m.label}</div>
                <div style={{ fontSize: '17px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
                {m.sub && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{m.sub}</div>}
              </div>
            ))}
          </div>
          {/* Recent sells */}
          <div style={{ marginTop: '14px', borderTop: '1px solid rgba(16,185,129,0.15)', paddingTop: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Recent Sells</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {realizedSummary.sells.slice(-5).reverse().map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent2)' }}>{s.symbol}</span>
                    <span style={{ color: 'var(--text3)' }}>{s.date}</span>
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px',
                      background: s.taxType === 'LTCG' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                      color: s.taxType === 'LTCG' ? 'var(--green2)' : 'var(--yellow)',
                      border: `1px solid ${s.taxType === 'LTCG' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                      fontWeight: '700',
                    }}>{s.taxType}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: colorPnl(s.realized) }}>
                    {s.realized >= 0 ? '+' : ''}{fmtCr(s.realized)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3-col row */}
      <div className="grid-3" style={{ gap: '14px', marginBottom: '20px' }}>
        {/* MF vs Stocks */}
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>MF vs Stocks Allocation</div>
          {stats.totalValue > 0 ? (
            <DonutChart
              data={[
                { label: 'Mutual Funds', value: stats.mfValue, color: '#38bdf8', pct: stats.mfPct },
                { label: 'Stocks',       value: stats.stValue,  color: '#a78bfa', pct: stats.stPct },
              ].filter(d => d.value > 0)}
              size={120}
            />
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: '12px' }}>No holdings</div>
          )}
        </div>

        {/* MF category mix */}
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>MF Category Mix</div>
          {Object.entries(mfCatMap).length > 0 ? (
            Object.entries(mfCatMap).map(([cat, val], i) => (
              <HBar key={i} label={cat} value={val} max={stats.mfValue} color={sectorColor(cat)} sub={fmt(val / (stats.mfValue || 1) * 100, 1) + '%'} />
            ))
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: '12px' }}>No mutual funds</div>
          )}
        </div>

        {/* Health score */}
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Portfolio Health Score</div>
          <HealthGauge score={healthScore} />
          <div className="divider" />
          {[
            { label: 'Diversification',  pct: Math.min(100, (stats.fundCount + stats.stockCount) * 10) },
            { label: 'Risk balance',     pct: stats.mfPct >= 50 && stats.mfPct <= 80 ? 85 : 60 },
            { label: 'Return quality',   pct: stats.overallCagr > 12 ? 90 : stats.overallCagr > 8 ? 70 : 50 },
            { label: 'Allocation focus', pct: stats.fundCount > 0 && stats.stockCount > 0 ? 80 : 50 },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{s.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '60px', height: '4px', background: 'var(--bg3)', borderRadius: '2px' }}>
                  <div style={{ height: '100%', width: s.pct + '%', background: s.pct > 75 ? 'var(--green)' : 'var(--yellow)', borderRadius: '2px' }} />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--font-mono)', width: '24px', textAlign: 'right' }}>{s.pct}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top performers */}
      {(topMF.length > 0 || topSt.length > 0) && (
        <div className="grid-2" style={{ gap: '14px', marginBottom: '20px' }}>
          {topMF.length > 0 && <TopList title="Top MF Performers" items={topMF} />}
          {topSt.length > 0 && <TopList title="Top Stock Gainers"  items={topSt} />}
        </div>
      )}

      {/* Portfolio alerts */}
      {holdings.length > 0 && (
        <div className="glass" style={{ padding: '18px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span>⚠️</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Portfolio Alerts</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {stats.stPct > 45 && (
              <Alert type="warning" msg={`Direct equity is ${fmt(stats.stPct, 1)}% of portfolio — consider capping at 40%`} />
            )}
            {stats.mfCagr < 8 && stats.mfCagr > 0 && (
              <Alert type="info" msg="MF CAGR below 8% — some funds may be underperforming" />
            )}
            {stats.fundCount + stats.stockCount < 3 && (
              <Alert type="warning" msg="Very concentrated portfolio — consider adding more holdings" />
            )}
            {realizedSummary.totalTax > 0 && (
              <Alert type="warning" msg={`Estimated tax liability of ${fmtCr(realizedSummary.totalTax)} on realized gains`} />
            )}
            <Alert type="success" msg={`${stats.fundCount} MF + ${stats.stockCount} stocks across your portfolio`} />
          </div>
        </div>
      )}

      {/* Suggested actions */}
      {holdings.length > 0 && (
        <div className="glass" style={{ padding: '18px', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.05))' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent2)', marginBottom: '10px' }}>
            Suggested Actions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {[
              { icon: '📈', action: 'Continue SIP',      detail: 'Maintain existing SIP amounts and review after 6 months' },
              { icon: '⚖️', action: 'Review Allocation', detail: `MF at ${fmt(stats.mfPct, 1)}% — ideal range is 60–75%` },
              { icon: '💰', action: 'LTCG Planning',     detail: 'Book equity gains below ₹1.25L annually to stay tax-free' },
              { icon: '🔄', action: 'Rebalance Check',   detail: 'Use the Rebalancer tab to check if drift exceeds ±5%' },
            ].map((a, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>{a.icon}</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '2px' }}>{a.action}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{a.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Local-only components (not duplicated elsewhere) ────────────────────────

function TopList({ title, items }) {
  return (
    <div className="glass" style={{ padding: '18px' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px' }}>{title}</div>
      {items.map((h, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{h.symbol}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{h.sector} · {h.holdingDays}d held</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: colorPnl(h.unrealizedGain ?? h.gain) }}>{fmtPct(h.returnPct, true)}</div>
            <div style={{ fontSize: '11px', color: colorPnl(h.unrealizedGain ?? h.gain) }}>{fmtCr(h.unrealizedGain ?? h.gain)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HealthGauge({ score }) {
  const color = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  const r = 44, cx = 55, cy = 55;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - score / 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
      <svg width="110" height="64">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--bg3)" strokeWidth="8" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} />
        <text x={cx} y={cy - 8} textAnchor="middle" fill={color} fontSize="22" fontWeight="800" fontFamily="var(--font-mono)">{score}</text>
        <text x={cx} y={cy + 6} textAnchor="middle" fill="var(--text3)" fontSize="9">/ 100</text>
      </svg>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '700', color }}>{score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs Work'}</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Portfolio health</div>
      </div>
    </div>
  );
}
