'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { DonutChart, HBar, Sparkline } from '@/components/charts/Charts';

export default function OverviewView() {
  const { stats, holdings, mfHoldings, stHoldings, currentPrices } = usePortfolio();

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
        <StatCard label="Total Value"    value={fmtCr(stats.totalValue)}    sub="Portfolio"             color="var(--accent2)" />
        <StatCard label="Total Invested" value={fmtCr(stats.totalInvested)} sub="Capital deployed"       color="var(--text2)" />
        <StatCard label="Total Gain"     value={fmtCr(stats.totalGain)}     sub={fmtPct(stats.totalReturnPct, true)} color={colorPnl(stats.totalGain)} />
        <StatCard label="Overall CAGR"   value={fmtPct(stats.overallCagr)}  sub="Annualised"             color="var(--green2)" />
        <StatCard label="MF Value"       value={fmtCr(stats.mfValue)}       sub={`${fmt(stats.mfPct,1)}% of portfolio`} color="var(--teal)" />
        <StatCard label="Stock Value"    value={fmtCr(stats.stValue)}       sub={`${fmt(stats.stPct,1)}% of portfolio`} color="var(--purple)" />
      </div>

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

      {/* Risk alerts */}
      {holdings.length > 0 && (
        <div className="glass" style={{ padding: '18px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span>⚠️</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Portfolio Alerts</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {stats.stPct > 45 && (
              <Alert type="warning" msg={`Direct equity is ${fmt(stats.stPct,1)}% of portfolio — consider capping at 40%`} />
            )}
            {stats.mfCagr < 8 && stats.mfCagr > 0 && (
              <Alert type="info" msg="MF CAGR below 8% — some funds may be underperforming" />
            )}
            {stats.fundCount + stats.stockCount < 3 && (
              <Alert type="warning" msg="Very concentrated portfolio — consider adding more holdings" />
            )}
            <Alert type="success" msg={`${stats.fundCount} MF + ${stats.stockCount} stocks across your portfolio`} />
          </div>
        </div>
      )}

      {/* Action plan */}
      {holdings.length > 0 && (
        <div className="glass" style={{ padding: '18px', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.05))' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent2)', marginBottom: '10px' }}>
            Suggested Actions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {[
              { icon: '📈', action: 'Continue SIP',       detail: 'Maintain existing SIP amounts and review after 6 months' },
              { icon: '⚖️', action: 'Review Allocation',  detail: `MF at ${fmt(stats.mfPct,1)}% — ideal range is 60–75%` },
              { icon: '💰', action: 'LTCG Planning',      detail: 'Book equity gains below ₹1.25L annually to stay tax-free' },
              { icon: '🔄', action: 'Rebalance Check',    detail: 'Use the Rebalancer tab to check if drift exceeds ±5%' },
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

function StatCard({ label, value, sub, color }) {
  return (
    <div className="metric-card">
      <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--font-mono)', color, marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{sub}</div>
    </div>
  );
}

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
            <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: colorPnl(h.gain) }}>{fmtPct(h.returnPct, true)}</div>
            <div style={{ fontSize: '11px', color: colorPnl(h.gain) }}>{fmtCr(h.gain)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Alert({ type, msg }) {
  const cfg = { warning: ['var(--yellow)', 'rgba(245,158,11,0.1)', '⚠'], info: ['var(--accent2)', 'rgba(59,130,246,0.1)', 'ℹ'], success: ['var(--green2)', 'rgba(16,185,129,0.1)', '✓'] };
  const [color, bg, icon] = cfg[type] || cfg.info;
  return (
    <div style={{ background: bg, border: `1px solid ${color}30`, borderRadius: '8px', padding: '10px 12px', display: 'flex', gap: '8px' }}>
      <span style={{ color, fontSize: '13px' }}>{icon}</span>
      <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{msg}</span>
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
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="var(--bg3)" strokeWidth="8" strokeLinecap="round" />
        <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
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
