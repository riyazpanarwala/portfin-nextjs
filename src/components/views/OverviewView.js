'use client';

import { useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { DonutChart, AllocationDonutChart, HBar } from '@/components/charts/Charts';
import { StatCard, Alert, EmptyState } from '@/components/ui/SharedUI';
import { useOverview } from '@/hooks/useOverview';
import styles from './OverviewView.module.css';

export default function OverviewView() {
  const ctx = usePortfolio();
  const {
    stats, holdings, mfHoldings, stHoldings,
    currentPrices, realizedSummary, portfolioXIRR, portfolioBeta,
    setActiveView,
  } = ctx;

  const {
    mfCatMap, stockSectorMap, topMF, topMFLaggards, topSt, topStLaggards, healthScore,
    donutData, combinedAllocationData, healthBars, hasSells,
    alerts, suggestedActions, recentSells,
    harvestingData,
  } = useOverview({ stats, holdings, mfHoldings, stHoldings, currentPrices, realizedSummary, portfolioXIRR });

  const [showAllHarvestingLots, setShowAllHarvestingLots] = useState(false);
  const [harvestingCollapsed, setHarvestingCollapsed]     = useState(false);
  const [allocViewTab, setAllocViewTab]                   = useState('combined');
  const [sectorMixTab, setSectorMixTab]                   = useState('mf');
  const [mfPerfTab, setMfPerfTab]                         = useState('gainers');
  const [stPerfTab, setStPerfTab]                         = useState('gainers');

  // If there are no holdings and no past sells, show onboarding empty state
  if (holdings.length === 0 && (!realizedSummary.sells || realizedSummary.sells.length === 0)) {
    return (
      <div className="fade-up">
        <EmptyState
          icon="📊"
          label="No Portfolio Holdings Yet"
          sub="Add your trades or import your CAS/trade sheet to see comprehensive portfolio analytics, asset allocation, and tax optimization recommendations."
          cta="+ Add Your First Trade"
          onCta={() => setActiveView('trade')}
        />
      </div>
    );
  }

  const handleActionClick = (action) => {
    if (action.targetView === 'tax-harvest') {
      setHarvestingCollapsed(false);
      const el = document.getElementById('tax-harvesting-panel');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (action.targetView) {
      setActiveView(action.targetView);
    }
  };

  const activeSectorData = sectorMixTab === 'mf' ? mfCatMap : stockSectorMap;
  const activeSectorTotal = sectorMixTab === 'mf' ? stats.mfValue : stats.stValue;

  return (
    <div className="fade-up">

      {/* ── Tier 1: Primary Hero Metrics ── */}
      <div className={styles.heroStatsRow}>
        <StatCard
          label="Total Portfolio Value"
          value={fmtCr(stats.totalValue)}
          sub="Net current worth"
          color="var(--accent2)"
          valueSize={22}
        />
        <StatCard
          label="Total Gain / Loss"
          value={fmtCr(stats.totalGain)}
          sub={`Return: ${fmtPct(stats.totalReturnPct, true)}`}
          color={colorPnl(stats.totalGain)}
          valueSize={22}
        />
        {portfolioXIRR != null ? (
          <StatCard
            label="Portfolio XIRR"
            value={fmtPct(portfolioXIRR)}
            sub={`Money-weighted · CAGR: ${fmtPct(stats.overallCagr)}`}
            color="var(--teal)"
            valueSize={22}
          />
        ) : (
          <StatCard
            label="Overall CAGR"
            value={fmtPct(stats.overallCagr)}
            sub="Annualised compound return"
            color="var(--green2)"
            valueSize={22}
          />
        )}
      </div>

      {/* ── Tier 2: Secondary Breakdown Grid ── */}
      <div className={styles.statsGrid}>
        <StatCard
          label="Mutual Funds"
          value={fmtCr(stats.mfValue)}
          sub={`${fmt(stats.mfPct, 1)}% of portfolio`}
          color="var(--teal)"
          valueSize={18}
          onClick={() => setActiveView('mf')}
        />
        <StatCard
          label="Direct Equity"
          value={fmtCr(stats.stValue)}
          sub={`${fmt(stats.stPct, 1)}% of portfolio`}
          color="var(--purple)"
          valueSize={18}
          onClick={() => setActiveView('stocks')}
        />
        <StatCard
          label="Total Invested"
          value={fmtCr(stats.totalInvested)}
          sub="Capital deployed"
          color="var(--text2)"
          valueSize={18}
        />
        <StatCard
          label="Unrealized P&L"
          value={fmtCr(stats.totalUnrealizedGain)}
          sub="Open positions"
          color={colorPnl(stats.totalUnrealizedGain)}
          valueSize={18}
        />
        <StatCard
          label="Realized P&L"
          value={fmtCr(stats.totalRealizedGain)}
          sub={`${realizedSummary.sells.length} sell${realizedSummary.sells.length !== 1 ? 's' : ''}`}
          color={colorPnl(stats.totalRealizedGain)}
          valueSize={18}
          onClick={hasSells ? () => {
            const el = document.getElementById('realized-panel');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          } : undefined}
        />
        {portfolioBeta?.beta != null ? (
          <StatCard
            label="Portfolio Beta"
            value={fmt(portfolioBeta.beta, 2)}
            sub={`${fmt(portfolioBeta.coveragePct, 0)}% coverage`}
            color="var(--yellow)"
            valueSize={18}
          />
        ) : (
          <StatCard
            label="Total Holdings"
            value={`${stats.fundCount + stats.stockCount}`}
            sub={`${stats.fundCount} MF · ${stats.stockCount} Stocks`}
            color="var(--text2)"
            valueSize={18}
          />
        )}
      </div>

      {/* ── Full-width Portfolio Allocation Card ── */}
      <div className="glass" style={{ padding: '20px', borderRadius: 10, marginBottom: '20px' }}>
        <div className={styles.panelHeaderWithTabs}>
          <div className={styles.panelTitle}>
            <span>📊</span> Overall Portfolio Allocation
          </div>
          <div className={styles.tabGroup}>
            <button
              onClick={() => setAllocViewTab('combined')}
              className={`${styles.tabBtn} ${allocViewTab === 'combined' ? styles.tabBtnActive : ''}`}
              title="Percentage allocation for each individual equity and MF holding overall"
            >
              All Holdings Combined
            </button>
            <button
              onClick={() => setAllocViewTab('asset')}
              className={`${styles.tabBtn} ${allocViewTab === 'asset' ? styles.tabBtnActive : ''}`}
              title="Mutual Funds vs Stocks overall percentage breakdown"
            >
              Asset Class (MF vs Stocks)
            </button>
          </div>
        </div>
        {stats.totalValue > 0 ? (
          allocViewTab === 'combined' && combinedAllocationData.length > 0 ? (
            <AllocationDonutChart
              data={combinedAllocationData}
              size={240}
              centerLabel={`${combinedAllocationData.length}`}
              centerSub="HOLDINGS"
              maxLegendHeight={260}
              legendGrid={true}
            />
          ) : (
            <DonutChart data={donutData} size={160} />
          )
        ) : (
          <div className={styles.noData}>No active holdings</div>
        )}
      </div>

      {/* ── 2-col row for Category / Sector Mix & Portfolio Health ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {/* Sector / Category Breakdown with Tabs */}
        <div className="glass" style={{ padding: '18px', borderRadius: 10 }}>
          <div className={styles.panelHeaderWithTabs}>
            <div className={styles.panelTitle}>
              <span>📁</span> {sectorMixTab === 'mf' ? 'MF Category Mix' : 'Equity Sector Mix'}
            </div>
            <div className={styles.tabGroup}>
              <button
                onClick={() => setSectorMixTab('mf')}
                className={`${styles.tabBtn} ${sectorMixTab === 'mf' ? styles.tabBtnActive : ''}`}
              >
                MF Categories
              </button>
              <button
                onClick={() => setSectorMixTab('stocks')}
                className={`${styles.tabBtn} ${sectorMixTab === 'stocks' ? styles.tabBtnActive : ''}`}
              >
                Stock Sectors
              </button>
            </div>
          </div>

          {Object.entries(activeSectorData).length > 0 ? (
            Object.entries(activeSectorData).map(([cat, val], i) => (
              <HBar
                key={i}
                label={cat}
                value={val}
                max={activeSectorTotal || 1}
                color={sectorColor(cat)}
                sub={`${fmt((val / (activeSectorTotal || 1)) * 100, 1)}%`}
              />
            ))
          ) : (
            <div className={styles.noData}>
              {sectorMixTab === 'mf' ? 'No mutual fund holdings' : 'No equity stock holdings'}
            </div>
          )}
        </div>

        {/* Portfolio Health Score */}
        <div className="glass" style={{ padding: '18px', borderRadius: 10 }}>
          <div className={styles.panelTitle} style={{ marginBottom: 14 }}>
            <span>❤️</span> Portfolio Health Score
          </div>
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
                      style={{
                        width: `${s.pct}%`,
                        background: s.pct > 75 ? 'var(--green)' : s.pct >= 50 ? 'var(--yellow)' : 'var(--red)',
                      }}
                    />
                  </div>
                  <span className={styles.healthBarValue}>{s.pct}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Top Performers & Laggards ── */}
      {(topMF.length > 0 || topSt.length > 0) && (
        <div className={styles.twoCol} style={{ marginBottom: '20px' }}>
          {/* Mutual Funds Performer / Laggard Card */}
          {topMF.length > 0 && (
            <div className="glass" style={{ padding: '18px', borderRadius: 10 }}>
              <div className={styles.panelHeaderWithTabs}>
                <div className={styles.panelTitle}>
                  <span>{mfPerfTab === 'gainers' ? '🏆' : '⚠️'}</span> MF {mfPerfTab === 'gainers' ? 'Top Performers' : 'Laggards'}
                </div>
                <div className={styles.tabGroup}>
                  <button
                    onClick={() => setMfPerfTab('gainers')}
                    className={`${styles.tabBtn} ${mfPerfTab === 'gainers' ? styles.tabBtnActive : ''}`}
                  >
                    Gainers
                  </button>
                  <button
                    onClick={() => setMfPerfTab('laggards')}
                    className={`${styles.tabBtn} ${mfPerfTab === 'laggards' ? styles.tabBtnActive : ''}`}
                  >
                    Laggards
                  </button>
                </div>
              </div>
              <TopList
                items={mfPerfTab === 'gainers' ? topMF : topMFLaggards}
                onItemClick={() => setActiveView('mf')}
              />
            </div>
          )}

          {/* Equity Stock Performer / Laggard Card */}
          {topSt.length > 0 && (
            <div className="glass" style={{ padding: '18px', borderRadius: 10 }}>
              <div className={styles.panelHeaderWithTabs}>
                <div className={styles.panelTitle}>
                  <span>{stPerfTab === 'gainers' ? '🚀' : '📉'}</span> Stock {stPerfTab === 'gainers' ? 'Top Gainers' : 'Draggers'}
                </div>
                <div className={styles.tabGroup}>
                  <button
                    onClick={() => setStPerfTab('gainers')}
                    className={`${styles.tabBtn} ${stPerfTab === 'gainers' ? styles.tabBtnActive : ''}`}
                  >
                    Gainers
                  </button>
                  <button
                    onClick={() => setStPerfTab('laggards')}
                    className={`${styles.tabBtn} ${stPerfTab === 'laggards' ? styles.tabBtnActive : ''}`}
                  >
                    Draggers
                  </button>
                </div>
              </div>
              <TopList
                items={stPerfTab === 'gainers' ? topSt : topStLaggards}
                onItemClick={() => setActiveView('stocks')}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Suggested Actions (Clickable & Actionable) ── */}
      {holdings.length > 0 && (
        <div className={`glass ${styles.actionsPanel}`}>
          <div className={styles.actionsPanelLabel}>
            <span>⚡ Suggested Actions</span>
            <span style={{ fontSize: 10, textTransform: 'none', fontWeight: 500, color: 'var(--text3)' }}>
              Click an action to navigate
            </span>
          </div>
          <div className={styles.actionsGrid}>
            {suggestedActions.map((a, i) => (
              <div
                key={i}
                className={`${styles.actionCard} ${a.targetView ? styles.actionCardClickable : ''}`}
                onClick={() => handleActionClick(a)}
                role={a.targetView ? 'button' : undefined}
                tabIndex={a.targetView ? 0 : undefined}
              >
                <div className={styles.actionCardTop}>
                  <div className={styles.actionCardIcon}>{a.icon}</div>
                  {a.targetView && <div className={styles.actionCardArrow}>↗</div>}
                </div>
                <div>
                  <div className={styles.actionCardTitle}>{a.action}</div>
                  <div className={styles.actionCardDetail}>{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Portfolio Alerts ── */}
      {holdings.length > 0 && (
        <div className={`glass ${styles.alertsPanel}`} style={{ marginBottom: '20px' }}>
          <div className={styles.alertsHeader}>
            <span>🔔</span>
            <span className={styles.alertsHeaderText}>Portfolio Alerts</span>
          </div>
          <div className={styles.alertsGrid}>
            {alerts.map((a, i) => <Alert key={i} type={a.type} msg={a.msg} />)}
          </div>
        </div>
      )}

      {/* ── Realized P&L Panel ── */}
      {hasSells && (
        <div id="realized-panel" className={`glass ${styles.realizedPanel}`}>
          <div className={styles.realizedPanelHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>💰</span> Realized P&amp;L Summary
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {realizedSummary.sells.length} total trade{realizedSummary.sells.length !== 1 ? 's' : ''}
            </span>
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
                <div className={`${styles.realizedMetricValue} mono-privacy`} style={{ color: m.color }}>
                  {m.value}
                </div>
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
                  <span className="mono-privacy" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: colorPnl(s.realized) }}>
                    {s.realized >= 0 ? '+' : ''}{fmtCr(s.realized)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tax-Loss Harvesting Panel (Collapsible) ── */}
      {holdings.length > 0 && (
        <div id="tax-harvesting-panel" className={`glass ${styles.harvestingPanel}`}>
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
              <button
                className={styles.collapseToggleBtn}
                onClick={() => setHarvestingCollapsed(prev => !prev)}
              >
                {harvestingCollapsed ? 'Expand ▼' : 'Collapse ▲'}
              </button>
            </div>
          </div>

          {!harvestingCollapsed && (
            <>
              <div className={styles.harvestingMetricsGrid}>
                <div className={styles.harvestingMetricCell}>
                  <div className={styles.harvestingMetricLabel}>Harvestable Loss</div>
                  <div className={`${styles.harvestingMetricValue} mono-privacy`} style={{ color: 'var(--red2)' }}>
                    {fmtCr(harvestingData.totalHarvestableLoss)}
                  </div>
                  <div className={styles.harvestingMetricSub}>{harvestingData.candidateLots.length} lot(s) eligible</div>
                </div>

                <div className={styles.harvestingMetricCell}>
                  <div className={styles.harvestingMetricLabel}>Est. Tax Savings</div>
                  <div className={`${styles.harvestingMetricValue} mono-privacy`} style={{ color: 'var(--green2)' }}>
                    {fmtCr(harvestingData.potentialTaxSavings)}
                  </div>
                  <div className={styles.harvestingMetricSub}>FY tax offset</div>
                </div>

                <div className={styles.harvestingMetricCell}>
                  <div className={styles.harvestingMetricLabel}>STCL Loss (&lt; 1 yr)</div>
                  <div className={`${styles.harvestingMetricValue} mono-privacy`} style={{ color: 'var(--yellow)' }}>
                    {fmtCr(harvestingData.stclCandidateLoss)}
                  </div>
                  <div className={styles.harvestingMetricSub}>Offsets STCG @ 20%</div>
                </div>

                <div className={styles.harvestingMetricCell}>
                  <div className={styles.harvestingMetricLabel}>LTCL Loss (&ge; 1 yr)</div>
                  <div className={`${styles.harvestingMetricValue} mono-privacy`} style={{ color: 'var(--red2)' }}>
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
                          <span className={`${styles.harvestingLotLoss} mono-privacy`}>-{fmtCr(lot.unrealizedLoss)}</span>
                          {lot.estimatedSavings > 0 && (
                            <span className={`${styles.harvestingLotSavings} mono-privacy`}>Est. Save ~{fmtCr(lot.estimatedSavings)}</span>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Local-only sub-components ── */

function TopList({ items, onItemClick }) {
  if (!items || items.length === 0) {
    return <div className={styles.noData}>No data available</div>;
  }

  return (
    <div>
      {items.map((h, i) => (
        <div
          key={i}
          className={`${styles.topListItem} ${onItemClick ? styles.topListItemClickable : ''}`}
          style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}
          onClick={onItemClick}
          title={onItemClick ? `View ${h.symbol} in details` : undefined}
        >
          <div>
            <div className={styles.topListItemName}>
              <span>{h.symbol}</span>
              {onItemClick && <span style={{ fontSize: 9, opacity: 0.5 }}>↗</span>}
            </div>
            <div className={styles.topListItemMeta}>{h.sector || 'Other'} · {h.holdingDays || 0}d held</div>
          </div>
          <div className={styles.topListItemRight}>
            <div className={`${styles.topListItemReturn} mono-privacy`} style={{ color: colorPnl(h.returnPct) }}>
              {fmtPct(h.returnPct, true)}
            </div>
            <div className={`${styles.topListItemGain} mono-privacy`} style={{ color: colorPnl(h.unrealizedGain ?? h.gain) }}>
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
