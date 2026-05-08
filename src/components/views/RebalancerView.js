'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt } from '@/lib/store';
import { useRebalancer } from '@/hooks/useRebalancer';
import styles from './RebalancerView.module.css';

export default function RebalancerView() {
  const { stats } = usePortfolio();
  const { allocations, total, isBalanced, actions, setTarget } = useRebalancer({ stats });

  const totalBarStyle = {
    background:   isBalanced ? 'rgba(16,185,129,0.1)'  : 'rgba(239,68,68,0.1)',
    border:       `1px solid ${isBalanced ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
  };
  const totalTextColor = isBalanced ? 'var(--green2)' : 'var(--red2)';

  return (
    <div className="fade-up">
      <div className={styles.layout}>

        {/* ── Left: target allocation ── */}
        <div className={`glass ${styles.targetPanel}`}>
          <div className={styles.targetPanelTitle}>Target Allocation</div>
          <div className={styles.targetPanelSub}>Set your ideal portfolio mix</div>

          {allocations.map((a, i) => (
            <div key={i} className={styles.allocationRow}>
              <div className={styles.allocationRowHeader}>
                <div className={styles.allocationLabel}>
                  <div className={styles.allocationDot} style={{ background: a.color }} />
                  <span className={styles.allocationLabelText}>{a.label}</span>
                </div>
                <div className={styles.allocationInputGroup}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={a.target}
                    onChange={e => setTarget(a.key, e.target.value)}
                    className={styles.allocationInput}
                  />
                  <span className={styles.allocationUnit}>%</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={a.target}
                onChange={e => setTarget(a.key, e.target.value)}
                className={styles.allocationRange}
                style={{ accentColor: a.color }}
              />
            </div>
          ))}

          <div className={styles.totalBar} style={totalBarStyle}>
            <span className={styles.totalBarLabel} style={{ color: totalTextColor }}>Total Allocation</span>
            <span className={styles.totalBarValue} style={{ color: totalTextColor }}>{total}%</span>
          </div>
        </div>

        {/* ── Right ── */}
        <div className={styles.rightCol}>

          {/* Current vs target */}
          <div className={`glass ${styles.comparisonPanel}`}>
            <div className={styles.comparisonTitle}>Current vs Target</div>
            {actions.map((a, i) => (
              <div key={i} className={styles.comparisonRow}>
                <div className={styles.comparisonRowHeader}>
                  <div className={styles.comparisonRowLeft}>
                    <div className={styles.allocationDot} style={{ background: a.color }} />
                    <span className={styles.comparisonRowLabel}>{a.label}</span>
                  </div>
                  <span className={styles.comparisonRowValues}>
                    {fmt(a.curr, 1)}% → {a.target}%
                  </span>
                </div>
                <div className={styles.barTrack}>
                  {/* current fill */}
                  <div
                    className={styles.barCurrent}
                    style={{ width: `${Math.min(100, a.curr)}%`, background: a.color, opacity: 0.4 }}
                  />
                  {/* diff fill */}
                  <div
                    className={styles.barDiff}
                    style={{
                      left:       `${Math.min(a.curr, a.target)}%`,
                      width:      `${Math.abs(a.target - a.curr)}%`,
                      background: a.diff > 0 ? 'var(--green2)' : 'var(--red2)',
                      opacity:    0.4,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Action plan */}
          <div className={`glass ${styles.actionPanel}`}>
            <div className={styles.actionPanelTitle}>Rebalancing Action Plan</div>
            <div className={styles.actionPanelSub}>Exact moves to reach your target allocation</div>

            {actions.map((a, i) => {
              const balanced = Math.abs(a.diff) < 1000;
              const borderColor = balanced
                ? 'var(--border)'
                : a.diff > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
              const amountColor = balanced || a.diff > 0 ? 'var(--green2)' : 'var(--red2)';

              return (
                <div key={i} className={styles.actionCard} style={{ border: `1px solid ${borderColor}` }}>
                  <div className={styles.actionCardLeft}>
                    <div
                      className={styles.actionCardIcon}
                      style={{ background: `${a.color}20` }}
                    >
                      {balanced ? '✓' : a.diff > 0 ? '📈' : '📉'}
                    </div>
                    <div>
                      <div className={styles.actionCardName}>{a.label}</div>
                      <div className={styles.actionCardDesc}>
                        {balanced ? 'Already balanced' : a.diff > 0 ? 'Buy more' : 'Reduce exposure'}
                      </div>
                    </div>
                  </div>
                  <div className={styles.actionCardRight}>
                    <div className={styles.actionCardAmount} style={{ color: amountColor }}>
                      {balanced ? '—' : (a.diff > 0 ? '+' : '') + fmtCr(a.diff)}
                    </div>
                    <div className={styles.actionCardDrift}>
                      {fmt(Math.abs(a.target - a.curr), 1)}% drift
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* How rebalancing works */}
          <div className={`glass ${styles.infoBox}`}>
            <div className={styles.infoBoxTitle}>How Rebalancing Works</div>
            <div className={styles.infoBoxText}>
              Rebalancing restores your intended risk profile by selling overweight assets and buying
              underweight ones. It enforces discipline by locking in gains from outperformers and
              deploying into laggards at lower prices. Aim to rebalance when any class drifts more
              than ±5% from target, or at least once per year.
            </div>
            <div className={styles.warningBox}>
              ⚠ Note: Selling in India attracts STCG (20%) or LTCG (12.5%) — factor this in before
              executing. Consider rebalancing via new SIP deployment into underweight assets first,
              to minimise taxable events.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
