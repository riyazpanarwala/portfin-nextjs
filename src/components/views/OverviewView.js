'use client';

import { useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { DonutChart, AllocationDonutChart, HBar } from '@/components/charts/Charts';
import { StatCard, Alert } from '@/components/ui/SharedUI';
import { useOverview } from '@/hooks/useOverview';
import styles from './OverviewView.module.css';

export default function OverviewView() {
  const ctx = usePortfolio();
  const { stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR, portfolioBeta } = ctx;

  const {
    mfCatMap, topMF, topSt, healthScore,
    donutData, combinedAllocationData, healthBars, hasSells,
    alerts, suggestedActions, recentSells,
    harvestingData,
  } = useOverview({ stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR });

  const [showAllHarvestingLots, setShowAllHarvestingLots] = useState(false);
  const [allocViewTab, setAllocViewTab]                   = useState('combined');

  return (
    <div className="fade-up">

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

      {/* Tax-Loss Harvesting Panel */}
      {holdings.length > 0 && (
        <div className={`glass ${styles.harvestingPanel}`}>
          <div className={styles.harvestingHeader}>
            <div className={styles.harvestingTitle}>
              <span>📉</span> Tax-Loss Harvesting Recommendations
            </div>
            <div className={styles.harvestingBadges}>
              {harvestingData.stclCandidateLoss > 0 && (
                <span className={`${styles.harvestingBadge} ${styles.badgeSTCL}`}>
                  STCL Offset
                </span>
              )}
              {harvestingData.ltclCandidateLoss > 0 && (
                <span className={`${styles.harvestingBadge} ${styles.badgeLTCL}`}>
                  LTCL Offset
                </span>
              )}
            </div>
          </div>

          <div className={styles.harvestingMetricsGrid}>
            <div className={styles.harvestingMetricCell}>
              <div className={styles.harvestingMetricLabel}>Harvestable Loss</div>
              <div className={styles.harvestingMetricValue} style={{ color: 'var(--red2)' }}>
                {fmtCr(harvestingData.totalHarvestableLoss)}
              </div>
              <div className={styles.harvestingMetricSub}>{harvestingData.candidateLots.length} lot(s) eligible</div>
            </div>

            <div className={styles.harvestingMetricCell}>
              <div className={styles.harvestingMetricLabel}>Est. Tax Savings</div>
              <div className={styles.harvestingMetricValue} style={{ color: 'var(--green2)' }}>
                {fmtCr(harvestingData.potentialTaxSavings)}
              </div>
              <div className={styles.harvestingMetricSub}>FY tax offset</div>
            </div>

            <div className={styles.harvestingMetricCell}>
              <div className={styles.harvestingMetricLabel}>STCL Loss (&lt; 1 yr)</div>
              <div className={styles.harvestingMetricValue} style={{ color: 'var(--yellow)' }}>
                {fmtCr(harvestingData.stclCandidateLoss)}
              </div>
              <div className={styles.harvestingMetricSub}>Offsets STCG @ 20%</div>
            </div>

            <div className={styles.harvestingMetricCell}>
              <div className={styles.harvestingMetricLabel}>LTCL Loss (&ge; 1 yr)</div>
              <div className={styles.harvestingMetricValue} style={{ color: 'var(--red2)' }}>
                {fmtCr(harvestingData.ltclCandidateLoss)}
              </div>
              <div className={styles.harvestingMetricSub}>Offsets LTCG @ 12.5%</div>
            </div>
          </div>

          {harvestingData.candidateLots.length > 0 ? (
            <div className={styles.harvestingLotsSection}>
              <div className={styles.harvestingLotsHeader}>
                <span className={styles.harvestingLotsLabel}>Candidate Lots to Harvest</span>
                {harvestingData.candidateLots.length > 3 && (
                  <button
                    className={styles.harvestingToggleBtn}
                    onClick={() => setShowAllHarvestingLots(prev => !prev)}
                  >
                    {showAllHarvestingLots ? 'Show Top 3' : `View All (${harvestingData.candidateLots.length})`}
                  </button>
                )}
              </div>

              <div className={styles.harvestingLotsList}>
                {(showAllHarvestingLots ? harvestingData.candidateLots : harvestingData.candidateLots.slice(0, 3)).map((lot, idx) => (
                  <div key={idx} className={styles.harvestingLotRow}>
                    <div className={styles.harvestingLotLeft}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className={styles.harvestingLotSymbol}>{lot.symbol}</span>
                          <span className={`${styles.taxChip} ${lot.taxType === 'STCL' ? styles.taxChipSTCG : styles.taxChipLTCG}`}>
                            {lot.taxType}
                          </span>
                        </div>
                        <div className={styles.harvestingLotMeta}>
                          Bought {lot.buyDate} · {lot.qty} units @ ₹{lot.buyPrice.toFixed(2)} (CMP: ₹{lot.cmp.toFixed(2)})
                        </div>
                      </div>
                    </div>

                    <div className={styles.harvestingLotRight}>
                      <span className={styles.harvestingLotLoss}>-{fmtCr(lot.unrealizedLoss)}</span>
                      {lot.estimatedSavings > 0 && (
                        <span className={styles.harvestingLotSavings}>Est. Save ~{fmtCr(lot.estimatedSavings)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.harvestingTips}>
                💡 <strong>Tax Tip:</strong> In India, Short-Term Capital Losses (STCL) can set off both STCG (20%) and LTCG (12.5%). Long-Term Capital Losses (LTCL) set off LTCG only. Since Indian tax law has no wash-sale rule, you can sell loss lots to harvest tax savings and immediately re-buy if you hold long-term conviction.
              </div>
            </div>
          ) : (
            <div className={styles.harvestingTips} style={{ marginTop: 0 }}>
              ✅ <strong>No Loss-Harvesting Candidates:</strong> All your active buy lots currently have positive or break-even unrealized gains.
            </div>
          )}
        </div>
      )}

      {/* 3-col row */}
      <div className={`${styles.threeCol} glass`} style={{ gap: '14px', marginBottom: '20px', background: 'transparent', border: 'none', borderRadius: 0, padding: 0 }}>
        <div className="glass" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className={styles.panelTitle} style={{ margin: 0 }}>Portfolio Allocation</div>
            <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.25)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
              <button
                onClick={() => setAllocViewTab('combined')}
                style={{
                  padding: '3px 7px', fontSize: '10px', fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: allocViewTab === 'combined' ? 'var(--accent2)' : 'transparent',
                  color: allocViewTab === 'combined' ? '#0f172a' : 'var(--text2)',
                  transition: 'all 0.15s ease',
                }}
                title="Percentage allocation for each individual equity and MF holding overall"
              >
                All Holdings
              </button>
              <button
                onClick={() => setAllocViewTab('asset')}
                style={{
                  padding: '3px 7px', fontSize: '10px', fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: allocViewTab === 'asset' ? 'var(--accent2)' : 'transparent',
                  color: allocViewTab === 'asset' ? '#0f172a' : 'var(--text2)',
                  transition: 'all 0.15s ease',
                }}
                title="Mutual Funds vs Stocks overall percentage breakdown"
              >
                Asset Class
              </button>
            </div>
          </div>
          {stats.totalValue > 0 ? (
            allocViewTab === 'combined' && combinedAllocationData.length > 0 ? (
              <AllocationDonutChart
                data={combinedAllocationData}
                size={140}
                centerLabel={`${combinedAllocationData.length}`}
                centerSub="HOLDINGS"
                maxLegendHeight={150}
              />
            ) : (
              <DonutChart data={donutData} size={120} />
            )
          ) : (
            <div className={styles.noData}>No holdings</div>
          )}
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
