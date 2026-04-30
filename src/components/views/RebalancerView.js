'use client';

import { useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl } from '@/lib/store';

const DEFAULTS = [
  { label: 'Mutual Funds (MF)', key: 'MF', target: 70, color: 'var(--teal)' },
  { label: 'Equity Stocks', key: 'STOCK', target: 20, color: 'var(--purple)' },
  { label: 'ETF / Index', key: 'ETF', target: 10, color: 'var(--accent2)' },
];

export default function RebalancerView() {
  const { stats, holdings } = usePortfolio();
  const [allocations, setAllocations] = useState(DEFAULTS);

  const total = allocations.reduce((s, a) => s + a.target, 0);

  const currentPct = {
    MF:    stats.totalValue > 0 ? (stats.mfValue / stats.totalValue * 100) : 0,
    STOCK: stats.totalValue > 0 ? (stats.stValue / stats.totalValue * 100) : 0,
    ETF:   0,
  };

  function setTarget(key, val) {
    setAllocations(prev => prev.map(a => a.key === key ? { ...a, target: Math.max(0, Math.min(100, +val)) } : a));
  }

  const actions = allocations.map(a => {
    const curr = currentPct[a.key] || 0;
    const targetVal = stats.totalValue * (a.target / 100);
    const currVal = stats.totalValue * (curr / 100);
    const diff = targetVal - currVal;
    return { ...a, curr, targetVal, currVal, diff };
  });

  return (
    <div className="fade-up">
      <div className="grid-sidebar-main" style={{ gap: '16px' }}>
        {/* Left: target allocation */}
        <div className="glass" style={{ padding: '18px', height: 'fit-content' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Target Allocation</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '16px' }}>Set your ideal portfolio mix</div>

          {allocations.map((a, i) => (
            <div key={i} style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: a.color }} />
                  <span style={{ fontSize: '12px', color: 'var(--text)' }}>{a.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number" min="0" max="100" value={a.target}
                    onChange={e => setTarget(a.key, e.target.value)}
                    style={{ width: '56px', textAlign: 'right', padding: '4px 8px' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text2)' }}>%</span>
                </div>
              </div>
              <input type="range" min="0" max="100" value={a.target}
                onChange={e => setTarget(a.key, e.target.value)}
                style={{ width: '100%', accentColor: a.color }} />
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: total === 100 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '8px', border: `1px solid ${total === 100 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: total === 100 ? 'var(--green2)' : 'var(--red2)' }}>Total Allocation</span>
            <span style={{ fontSize: '14px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: total === 100 ? 'var(--green2)' : 'var(--red2)' }}>{total}%</span>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Current vs target */}
          <div className="glass" style={{ padding: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Current vs Target</div>
            {actions.map((a, i) => (
              <div key={i} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: a.color }} />
                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>{a.label}</span>
                  </div>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                    {fmt(a.curr, 1)}% → {a.target}%
                  </span>
                </div>
                {/* Stacked bar */}
                <div style={{ height: '8px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: '100%', width: Math.min(100, a.curr) + '%', background: a.color, opacity: 0.4, borderRadius: '4px', position: 'absolute', left: 0, top: 0 }} />
                  <div style={{ height: '100%', width: Math.min(100, a.target) + '%', background: a.color, borderRadius: '4px', position: 'absolute', left: 0, top: 0, border: '1px solid white', opacity: 0.2, pointerEvents: 'none' }}
                    style={{ position: 'absolute', left: Math.min(a.curr, a.target) + '%', top: 0, height: '100%', width: Math.abs(a.target - a.curr) + '%', background: a.diff > 0 ? 'var(--green2)' : 'var(--red2)', opacity: 0.4 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Rebalancing action plan */}
          <div className="glass" style={{ padding: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Rebalancing Action Plan</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>Exact moves to reach your target allocation</div>
            {actions.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg3)', borderRadius: '8px', marginBottom: '8px', border: `1px solid ${Math.abs(a.diff) < 1000 ? 'var(--border)' : a.diff > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: a.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                    {Math.abs(a.diff) < 1000 ? '✓' : a.diff > 0 ? '📈' : '📉'}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{a.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      {Math.abs(a.diff) < 1000 ? 'Already balanced' : a.diff > 0 ? `Buy more` : `Reduce exposure`}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: Math.abs(a.diff) < 1000 ? 'var(--green2)' : a.diff > 0 ? 'var(--green2)' : 'var(--red2)' }}>
                    {Math.abs(a.diff) < 1000 ? '—' : (a.diff > 0 ? '+' : '') + fmtCr(a.diff)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                    {fmt(Math.abs(a.target - a.curr), 1)}% drift
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* How rebalancing works */}
          <div className="glass" style={{ padding: '18px', background: 'rgba(59,130,246,0.04)' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent2)', marginBottom: '8px' }}>How Rebalancing Works</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.8' }}>
              Rebalancing restores your intended risk profile by selling overweight assets and buying underweight ones.
              It enforces discipline by locking in gains from outperformers and deploying into laggards at lower prices.
              Aim to rebalance when any class drifts more than ±5% from target, or at least once per year.
            </div>
            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', fontSize: '12px', color: '#fcd34d' }}>
              ⚠ Note: Selling in India attracts STCG (20%) or LTCG (12.5%) — factor this in before executing.
              Consider rebalancing via new SIP deployment into underweight assets first, to minimise taxable events.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
