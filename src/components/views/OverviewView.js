'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { DonutChart, HBar, Sparkline } from '@/components/charts/Charts';
import { StatCard, Alert } from '@/components/ui/SharedUI';
import { useOverview } from '@/hooks/useOverview';
import styles from './OverviewView.module.css';

export default function OverviewView() {
  const ctx = usePortfolio();
  const { stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR, portfolioBeta } = ctx;

  const {
    mfCatMap, topMF, topSt, healthScore,
    priceSymbols, donutData, healthBars, hasSells,
    alerts, suggestedActions, recentSells,
  } = useOverview({ stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR });

  return (
    <div className="fade-up">

      {/* Live price notice */}
      {priceSymbols.length > 0 && (
        <div className={styles.priceNotice}>
          <span className="live-dot" />
          Prices fetched for {priceSymbols.length} symbol{priceSymbols.length > 1 ? 's' : ''}: {priceSymbols.join(', ')}
        </div>
      )}

      {/* Summary stats */}
      <div className={styles.statsGrid}>
        <StatCard label="Total Value" value={fmtCr(stats.totalValue)} sub="Portfolio" color="var(--accent2)" valueSize={20} />
        <StatCard label="Total Invested" value={fmtCr(stats.totalInvested)} sub="Capital deployed" color="var(--text2)" valueSize={20} />
        <StatCard label="Total Gain" value={fmtCr(stats.totalGain)} sub={fmtPct(stats.totalReturnPct, true)} color={colorPnl(stats.totalGain)} valueSize={20} />
        <StatCard label="Unrealized P&L" value={fmtCr(stats.totalUnrealizedGain)} sub="Open positions" color={colorPnl(stats.totalUnrealizedGain)} valueSize={20} />
        <StatCard label="Realized P&L" value={fmtCr(stats.totalRealizedGain)} sub={`${realizedSummary.sells.length} sell${realizedSummary.sells.length !== 1 ? 's' : ''}`} color={colorPnl(stats.totalRealizedGain)} valueSize={20} />
        <StatCard label="Overall CAGR" value={fmtPct(stats.overallCagr)} sub="Annualised" color="var(--green2)" valueSize={20} />
        {portfolioXIRR != null && (
          <StatCard label="Portfolio XIRR" value={fmtPct(portfolioXIRR)} sub="Money-weighted" color="var(--teal)" valueSize={20} />
        )}
        {portfolioBeta?.beta != null && (
          <StatCard label="Portfolio Beta" value={fmt(portfolioBeta.beta, 2)} sub={`${fmt(portfolioBeta.coveragePct, 0)}% coverage`} color="var(--yellow)" valueSize={20} />
        )}
        <StatCard label="MF Value" value={fmtCr(stats.mfValue)} sub={`${fmt(stats.mfPct, 1)}% of portfolio`} color="var(--teal)" valueSize={20} />
        <StatCard label="Stock Value" value={fmtCr(stats.stValue)} sub={`${fmt(stats.stPct, 1)}% of portfolio`} color="var(--purple)" valueSize={20} />
      </div>

      {/* Realized P&L panel */}
      {hasSells && (
        <div className={`glass ${styles.realizedPanel}`}>
          <div className={styles.realizedPanelHeader}>
            <span>💰</span> Realized P&amp;L Summary
          </div>
          <div className={styles.realizedMetricsGrid}>
            {[
              { label: 'Total Realized', value: fmtCr(realizedSummary.totalRealized), color: colorPnl(realizedSummary.totalRealized) },
              { label: 'LTCG Gain', value: fmtCr(realizedSummary.ltcgGain), color: 'var(--green2)', sub: '12.5% tax rate' },
              { label: 'STCG Gain', value: fmtCr(realizedSummary.stcgGain), color: 'var(--yellow)', sub: '20% tax rate' },
              { label: 'Est. Tax Liability', value: fmtCr(realizedSummary.totalTax), color: 'var(--red2)', sub: 'FY estimate' },
            ].map((m, i) => (
              <div key={i} className={styles.realizedMetricCell}>
                <div className={styles.realizedMetricLabel}>{m.label}</div>
                <div className={styles.realizedMetricValue} style={{ color: m.color }}>{m.value}</div>
                {m.sub && <div className={styles.realizedMetricSub}>{m.sub}</div>}
              </div>
            ))}
          </div>

          <div className={styles.recentSellsSection}>
            <div className={styles.recentSellsLabel}>Recent Sells</div>
            <div className={styles.recentSellsList}>
              {recentSells.map((s, i) => (
                <div key={i} className={styles.recentSellRow}>
                  <div className={styles.recentSellLeft}>
                    <span className={styles.recentSellSymbol}>{s.symbol}</span>
                    <span className={styles.recentSellDate}>{s.date}</span>
                    <span className={`${styles.taxChip} ${s.taxType === 'LTCG' ? styles.taxChipLTCG : styles.taxChipSTCG}`}>
                      {s.taxType}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: colorPnl(s.realized) }}>
                    {s.realized >= 0 ? '+' : ''}{fmtCr(s.realized)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3-col row */}
      <div className={`${styles.threeCol} glass`} style={{ gap: '14px', marginBottom: '20px', background: 'transparent', border: 'none', borderRadius: 0, padding: 0 }}>
        <div className="glass" style={{ padding: '18px' }}>
          <div className={styles.panelTitle}>MF vs Stocks Allocation</div>
          {stats.totalValue > 0
            ? <DonutChart data={donutData} size={120} />
            : <div className={styles.noData}>No holdings</div>
          }
        </div>

        <div className="glass" style={{ padding: '18px' }}>
          <div className={styles.panelTitle}>MF Category Mix</div>
          {Object.entries(mfCatMap).length > 0
            ? Object.entries(mfCatMap).map(([cat, val], i) => (
              <HBar key={i} label={cat} value={val} max={stats.mfValue} color={sectorColor(cat)} sub={fmt(val / (stats.mfValue || 1) * 100, 1) + '%'} />
            ))
            : <div className={styles.noData}>No mutual funds</div>
          }
        </div>

        <div className="glass" style={{ padding: '18px' }}>
          <div className={styles.panelTitle}>Portfolio Health Score</div>
          <HealthGauge score={healthScore} />
          <div className="divider" />
          <div className={styles.healthBarsWrapper}>
            {healthBars.map((s, i) => (
              <div key={i} className={styles.healthBarRow}>
                <span className={styles.healthBarLabel}>{s.label}</span>
                <div className={styles.healthBarRight}>
                  <div className={styles.healthBarTrack}>
                    <div
                      className={styles.healthBarFill}
                      style={{ width: s.pct + '%', background: s.pct > 75 ? 'var(--green)' : 'var(--yellow)' }}
                    />
                  </div>
                  <span className={styles.healthBarValue}>{s.pct}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top performers */}
      {(topMF.length > 0 || topSt.length > 0) && (
        <div className={styles.twoCol} style={{ marginBottom: '20px' }}>
          {topMF.length > 0 && <TopList title="Top MF Performers" items={topMF} />}
          {topSt.length > 0 && <TopList title="Top Stock Gainers" items={topSt} />}
        </div>
      )}

      {/* Portfolio alerts */}
      {holdings.length > 0 && (
        <div className={`glass ${styles.alertsPanel}`} style={{ marginBottom: '20px' }}>
          <div className={styles.alertsHeader}>
            <span>⚠️</span>
            <span className={styles.alertsHeaderText}>Portfolio Alerts</span>
          </div>
          <div className={styles.alertsGrid}>
            {alerts.map((a, i) => <Alert key={i} type={a.type} msg={a.msg} />)}
          </div>
        </div>
      )}

      {/* Suggested actions */}
      {holdings.length > 0 && (
        <div className={`glass ${styles.actionsPanel}`}>
          <div className={styles.actionsPanelLabel}>Suggested Actions</div>
          <div className={styles.actionsGrid}>
            {suggestedActions.map((a, i) => (
              <div key={i} className={styles.actionCard}>
                <div className={styles.actionCardIcon}>{a.icon}</div>
                <div className={styles.actionCardTitle}>{a.action}</div>
                <div className={styles.actionCardDetail}>{a.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Local-only sub-components ── */

function TopList({ title, items }) {
  return (
    <div className="glass" style={{ padding: '18px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{title}</div>
      {items.map((h, i) => (
        <div key={i} className={styles.topListItem}
          style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div>
            <div className={styles.topListItemName}>{h.symbol}</div>
            <div className={styles.topListItemMeta}>{h.sector} · {h.holdingDays}d held</div>
          </div>
          <div>
            <div className={styles.topListItemReturn} style={{ color: colorPnl(h.unrealizedGain ?? h.gain) }}>
              {fmtPct(h.returnPct, true)}
            </div>
            <div className={styles.topListItemGain} style={{ color: colorPnl(h.unrealizedGain ?? h.gain) }}>
              {fmtCr(h.unrealizedGain ?? h.gain)}
            </div>
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
    <div className={styles.healthGaugeWrapper}>
      <svg width="110" height="64">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--bg3)" strokeWidth="8" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} />
        <text x={cx} y={cy - 8} textAnchor="middle" fill={color} fontSize="22" fontWeight="800" fontFamily="var(--font-mono)">{score}</text>
        <text x={cx} y={cy + 6} textAnchor="middle" fill="var(--text3)" fontSize="9">/ 100</text>
      </svg>
      <div>
        <div className={styles.healthLabel} style={{ color }}>
          {score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs Work'}
        </div>
        <div className={styles.healthSub}>Portfolio health</div>
      </div>
    </div>
  );
}
