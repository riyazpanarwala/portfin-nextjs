'use client';

import { RefreshCw, UserRound } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, colorPnl } from '@/lib/store';

export default function Header({ onRefreshPrices }) {
  const { stats } = usePortfolio();
  const dateStr = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });

  return (
    <header className="top-header">
      <div className="top-metrics">
        <MetricPill label="Total Value"    value={fmtCr(stats.totalValue)} />
        <Sep />
        <MetricPill label="Overall P&L"   value={fmtCr(stats.totalGain)} sub={fmtPct(stats.totalReturnPct, true)} color={colorPnl(stats.totalGain)} />
        <Sep />
        <MetricPill label="MF CAGR"        value={fmtPct(stats.mfCagr)}   color="var(--accent2)" />
        <Sep />
        <MetricPill label="As of"          value={dateStr} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto', flexShrink: 0 }}>
        {onRefreshPrices && (
          <button onClick={onRefreshPrices} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '11px' }} title="Refresh live prices">
            <RefreshCw size={14} /> Prices
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span className="live-dot" />
          <span style={{ fontSize: '10px', color: 'var(--text3)' }}>LIVE</span>
        </div>
        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}>
          <UserRound size={15} />
        </div>
      </div>
    </header>
  );
}

function Sep() { return <div style={{ width: '1px', height: '26px', background: 'var(--border)', flexShrink: 0 }} />; }

function MetricPill({ label, value, sub, color }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
        <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: color || 'var(--text)' }}>{value || '—'}</span>
        {sub && <span style={{ fontSize: '11px', fontWeight: '600', color: color || 'var(--text2)' }}>{sub}</span>}
      </div>
    </div>
  );
}
