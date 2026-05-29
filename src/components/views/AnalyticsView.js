'use client';

import { useState, useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { BarChart, HBar } from '@/components/charts/Charts';
import { StatCard } from '@/components/ui/SharedUI';
import { BenchmarkComparisonPanel } from '@/components/views/BenchmarkComparisonPanel';
import { useAnalyticsView } from '@/hooks/useAnalyticsView';
import { useSnapshots } from '@/hooks/useSnapshots';
import { YearByYearView } from './YearByYearView';
import styles from './AnalyticsView.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyDelta(delta) {
  if (delta >  5) return { label: 'OVERWEIGHT',  color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)' };
  if (delta >  2) return { label: 'SLIGHT OW',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' };
  if (delta > -2) return { label: 'NEUTRAL',     color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' };
  if (delta > -5) return { label: 'SLIGHT UW',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.35)' };
  return             { label: 'UNDERWEIGHT', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' };
}

const SECTOR_ICONS = {
  'Large Cap':'📊','Small Cap':'🔬','Mid Cap':'📈','Flexi Cap':'🔀','ELSS':'💰',
  'Value':'💎','Diversified':'🌐','Energy':'⚡','Power':'⚡','Renewable Energy':'🌱',
  'Defence':'🛡','Finance':'🏦','FMCG':'🛒','Metals & Mining':'⛏','Mining':'⛏',
  'Construction':'🏗','IT':'💻','Banking':'🏛','Bonds':'📜','Index ETF':'📊',
  'Defence ETF':'🛡','Commodities ETF':'🥇','Other':'◦','Speculative':'🎯',
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function EmptyFeature({ icon, title, sub }) {
  return (
    <div className={styles.emptyFeature}>
      <span className={styles.emptyFeatureIcon}>{icon}</span>
      <div className={styles.emptyFeatureTitle}>{title}</div>
      {sub && <div className={styles.emptyFeatureSub}>{sub}</div>}
    </div>
  );
}

function FeatureHeader({ icon, title, sub }) {
  return (
    <div className={styles.featureHeader}>
      <div className={styles.featureTitleRow}>
        <span className={styles.featureIcon}>{icon}</span>
        <div>
          <div className={styles.featureTitle}>{title}</div>
          {sub && <div className={styles.featureSub}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue} style={{ color: color || 'var(--text)' }}>{value}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function InfoBox({ children, borderColor, bg }) {
  return (
    <div className={styles.infoBox} style={{ borderColor, background: bg }}>
      {children}
    </div>
  );
}

function ChartBox({ title, children }) {
  return (
    <div className={styles.chartBox}>
      <div className={styles.chartBoxTitle}>{title}</div>
      {children}
    </div>
  );
}

function TableBox({ title, children }) {
  return (
    <div className={styles.tableBox}>
      <div className={styles.tableBoxTitle}>{title}</div>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  );
}

function Badge({ children, color, bg, border }) {
  return (
    <span className={styles.badge} style={{ color, background: bg, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DRAWDOWN ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

function DrawdownAnalysis({ snapshots }) {
  const analysis = useMemo(() => {
    if (!snapshots || snapshots.length < 2) return null;

    const series = [...snapshots]
      .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt))
      .map(s => ({ date: s.snapshotAt.slice(0, 10), value: parseFloat(s.totalValue) }));

    const drawdownState = series.reduce((acc, pt) => {
      const peak = pt.value > acc.peak ? pt.value : acc.peak;
      const dd = peak > 0 ? ((pt.value - peak) / peak) * 100 : 0;
      const isMaxDrawdown = dd < acc.maxDrawdown;
      const isAllTimePeak = pt.value > acc.allTimePeak;

      return {
        peak,
        maxDrawdown: isMaxDrawdown ? dd : acc.maxDrawdown,
        maxDrawdownDate: isMaxDrawdown ? pt.date : acc.maxDrawdownDate,
        allTimePeak: isAllTimePeak ? pt.value : acc.allTimePeak,
        allTimePeakDate: isAllTimePeak ? pt.date : acc.allTimePeakDate,
        drawdownSeries: [...acc.drawdownSeries, { ...pt, drawdown: dd, peak }],
      };
    }, {
      peak: series[0].value,
      maxDrawdown: 0,
      maxDrawdownDate: series[0].date,
      allTimePeak: series[0].value,
      allTimePeakDate: series[0].date,
      drawdownSeries: [],
    });

    const {
      drawdownSeries,
      maxDrawdown,
      maxDrawdownDate,
      allTimePeak,
      allTimePeakDate,
    } = drawdownState;

    const currentDrawdown = drawdownSeries[drawdownSeries.length - 1].drawdown;
    const currentVal = series[series.length - 1].value;
    const gapFromATH = allTimePeak > 0 ? ((currentVal - allTimePeak) / allTimePeak) * 100 : 0;

    // Detect recovery periods
    let inDrawdown = false;
    let drawdownStart = null;
    const recoveries = [];
    for (let i = 1; i < drawdownSeries.length; i++) {
      const curr = drawdownSeries[i];
      if (!inDrawdown && curr.drawdown < -1) { inDrawdown = true; drawdownStart = curr.date; }
      else if (inDrawdown && curr.drawdown >= -0.5) {
        const days = Math.round((new Date(curr.date) - new Date(drawdownStart)) / 864e5);
        recoveries.push({ start: drawdownStart, end: curr.date, days });
        inDrawdown = false; drawdownStart = null;
      }
    }

    const avgRecovery = recoveries.length > 0
      ? Math.round(recoveries.reduce((s, r) => s + r.days, 0) / recoveries.length) : null;

    const barData = drawdownSeries.map(pt => ({
      label: pt.date.slice(5),
      value: Math.abs(pt.drawdown),
      color: pt.drawdown < -10 ? 'var(--red2)' : pt.drawdown < -3 ? 'var(--yellow)' : 'var(--green2)',
    }));

    return { drawdownSeries, maxDrawdown, maxDrawdownDate, currentDrawdown,
      allTimePeak, allTimePeakDate, gapFromATH, recoveries, avgRecovery, currentVal, barData };
  }, [snapshots]);

  if (!analysis) return <EmptyFeature icon="📉" title="Need at least 2 snapshots" sub="Save snapshots over time to track drawdown history" />;

  const ddColor = analysis.currentDrawdown < -10 ? 'var(--red2)' : analysis.currentDrawdown < -3 ? 'var(--yellow)' : 'var(--green2)';

  return (
    <div className={styles.featureSection}>
      <FeatureHeader icon="📉" title="Drawdown Analysis" sub="Peak-to-trough decline from all-time highs using saved snapshots" />

      <div className={styles.metricsGrid4}>
        <MetricCard label="Current Drawdown" value={`${fmt(analysis.currentDrawdown, 1)}%`} color={ddColor} sub="From recent peak" />
        <MetricCard label="Max Drawdown" value={`${fmt(analysis.maxDrawdown, 1)}%`}
          color={analysis.maxDrawdown < -20 ? 'var(--red2)' : analysis.maxDrawdown < -10 ? 'var(--yellow)' : 'var(--green2)'}
          sub={analysis.maxDrawdownDate} />
        <MetricCard label="All-Time High" value={fmtCr(analysis.allTimePeak)} color="var(--accent2)" sub={analysis.allTimePeakDate} />
        <MetricCard label="Gap from ATH"
          value={`${analysis.gapFromATH >= 0 ? '+' : ''}${fmt(analysis.gapFromATH, 1)}%`}
          color={colorPnl(analysis.gapFromATH)} sub={`${fmtCr(analysis.currentVal)} today`} />
      </div>

      {analysis.avgRecovery !== null && (
        <div className={styles.recoveryBar}>
          <span className={styles.recoveryLabel}>Avg recovery time: </span>
          <span className={styles.recoveryValue}>{analysis.avgRecovery} days</span>
          <span className={styles.recoveryMeta}> · {analysis.recoveries.length} drawdown period{analysis.recoveries.length !== 1 ? 's' : ''} recovered</span>
        </div>
      )}

      <ChartBox title="Drawdown Depth Over Time (%)">
        <BarChart data={analysis.barData} height={130} />
      </ChartBox>

      {analysis.recoveries.length > 0 && (
        <TableBox title="Drawdown Periods">
          <table>
            <thead><tr><th>Start</th><th>Recovery Date</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              {analysis.recoveries.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{r.start}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>{r.end}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.days}d</td>
                  <td><Badge color="var(--green2)" bg="rgba(16,185,129,0.15)" border="rgba(16,185,129,0.3)">Recovered</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}

      {analysis.currentDrawdown < -0.5 && (
        <InfoBox borderColor="rgba(245,158,11,0.3)" bg="rgba(245,158,11,0.06)">
          <span style={{ color: 'var(--yellow)' }}>⚠</span>
          <span> Portfolio is currently <strong style={{ color: 'var(--yellow)' }}>{fmt(Math.abs(analysis.currentDrawdown), 1)}%</strong> below its recent peak of <strong>{fmtCr(analysis.drawdownSeries[analysis.drawdownSeries.length - 1]?.peak)}</strong>. Historical avg recovery: {analysis.avgRecovery ? `${analysis.avgRecovery} days` : 'insufficient data'}.</span>
        </InfoBox>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SIP PERFORMANCE TRACKER
// ─────────────────────────────────────────────────────────────────────────────

function SIPPerformance({ trades, holdings }) {
  const sipData = useMemo(() => {
    const bySymbol = {};
    trades.filter(t => t.tradeType === 'BUY').forEach(t => {
      if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
      bySymbol[t.symbol].push(t);
    });

    const results = [];
    for (const [symbol, sysTrades] of Object.entries(bySymbol)) {
      if (sysTrades.length < 3) continue;
      const sorted = [...sysTrades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
      let totalGap = 0;
      for (let i = 1; i < sorted.length; i++)
        totalGap += (new Date(sorted[i].tradeDate) - new Date(sorted[i - 1].tradeDate)) / 864e5;
      const avgGap = totalGap / (sorted.length - 1);
      if (avgGap < 20) continue;

      const holding = holdings.find(h => h.symbol === symbol);
      if (!holding) continue;

      const totalInvested = sorted.reduce((s, t) => s + parseFloat(t.quantity) * parseFloat(t.price), 0);
      const totalUnits    = sorted.reduce((s, t) => s + parseFloat(t.quantity), 0);
      const currentValue  = totalUnits * holding.cmp;
      const firstPrice    = parseFloat(sorted[0].price);
      const lumpSumUnits  = totalInvested / firstPrice;
      const lumpSumValue  = lumpSumUnits * holding.cmp;
      const sipReturn     = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;
      const lumpSumReturn = totalInvested > 0 ? ((lumpSumValue - totalInvested) / totalInvested) * 100 : 0;
      const holdDays      = Math.round((new Date() - new Date(sorted[0].tradeDate)) / 864e5);

      results.push({
        symbol, name: holding.name, assetType: holding.assetType,
        tradeCount: sorted.length, avgGap: Math.round(avgGap),
        totalInvested, currentValue, sipReturn, lumpSumReturn,
        sipAdvantage: sipReturn - lumpSumReturn,
        firstTrade: sorted[0].tradeDate, lastTrade: sorted[sorted.length - 1].tradeDate,
        avgMonthlyAmount: totalInvested / (holdDays / 30),
      });
    }
    return results.sort((a, b) => b.totalInvested - a.totalInvested);
  }, [trades, holdings]);

  if (!sipData.length) return <EmptyFeature icon="📆" title="No SIP patterns detected" sub="3+ buy trades spaced 20+ days apart on the same instrument qualify as SIP" />;

  const totalSIPInvested = sipData.reduce((s, d) => s + d.totalInvested, 0);
  const totalSIPValue    = sipData.reduce((s, d) => s + d.currentValue, 0);
  const sipWinners       = sipData.filter(d => d.sipAdvantage > 0).length;

  return (
    <div className={styles.featureSection}>
      <FeatureHeader icon="📆" title="SIP Performance Tracker" sub="Recurring investment detection — SIP vs lump-sum comparison" />

      <div className={styles.metricsGrid4}>
        <MetricCard label="SIP Instruments" value={sipData.length} color="var(--accent2)" sub="Auto-detected" />
        <MetricCard label="Total SIP Capital" value={fmtCr(totalSIPInvested)} color="var(--text)" sub="Across all SIPs" />
        <MetricCard label="Current SIP Value" value={fmtCr(totalSIPValue)}
          color={colorPnl(totalSIPValue - totalSIPInvested)} sub={`${fmtCr(totalSIPValue - totalSIPInvested)} gain`} />
        <MetricCard label="SIP Beat Lump-sum"
          value={`${sipWinners}/${sipData.length}`}
          color={sipWinners > sipData.length / 2 ? 'var(--green2)' : 'var(--yellow)'}
          sub="instruments" />
      </div>

      <div className={styles.sipTableWrapper}>
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th style={{ textAlign: 'right' }}>Installments</th>
              <th style={{ textAlign: 'right' }}>Avg Gap</th>
              <th style={{ textAlign: 'right' }}>Invested</th>
              <th style={{ textAlign: 'right' }}>Current Value</th>
              <th style={{ textAlign: 'right' }}>SIP Return</th>
              <th style={{ textAlign: 'right' }}>Lump-sum Return</th>
              <th style={{ textAlign: 'right' }}>SIP Advantage</th>
              <th style={{ textAlign: 'right' }}>Avg ₹/Month</th>
            </tr>
          </thead>
          <tbody>
            {sipData.map((d, i) => (
              <tr key={i}>
                <td>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)' }}>{d.symbol}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{d.firstTrade} → {d.lastTrade}</div>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{d.tradeCount}×</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{d.avgGap}d</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCr(d.totalInvested)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtCr(d.currentValue)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: colorPnl(d.sipReturn), fontWeight: 700 }}>
                  {d.sipReturn >= 0 ? '+' : ''}{fmt(d.sipReturn, 1)}%
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: colorPnl(d.lumpSumReturn) }}>
                  {d.lumpSumReturn >= 0 ? '+' : ''}{fmt(d.lumpSumReturn, 1)}%
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Badge
                    color={d.sipAdvantage > 0 ? 'var(--green2)' : 'var(--red2)'}
                    bg={d.sipAdvantage > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)'}
                    border={d.sipAdvantage > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}>
                    {d.sipAdvantage > 0 ? '+' : ''}{fmt(d.sipAdvantage, 1)}%
                  </Badge>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{fmtCr(d.avgMonthlyAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InfoBox borderColor="rgba(59,130,246,0.25)" bg="rgba(59,130,246,0.06)">
        <span style={{ color: 'var(--accent2)' }}>ℹ</span>
        <span> <strong>SIP Advantage</strong> = SIP return% − Lump-sum return% (same total capital invested at day-1 price). Positive means your staggered buying outperformed going all-in on day one.</span>
      </InfoBox>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONCENTRATION RISK SCORE
// ─────────────────────────────────────────────────────────────────────────────

function ConcentrationGauge({ score, color, label }) {
  const r = 54, cx = 70, cy = 70;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - score / 100);
  return (
    <div className={styles.gaugeWrapper}>
      <svg width="140" height="80" viewBox="0 0 140 80">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--bg3)" strokeWidth="10" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x={cx} y={cy - 10} textAnchor="middle" fill={color} fontSize="24" fontWeight="800" fontFamily="var(--font-mono)">{score}</text>
        <text x={cx} y={cx + 4} textAnchor="middle" fill="var(--text3)" fontSize="9">/ 100</text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>Diversification score</div>
      </div>
    </div>
  );
}

function ConcentrationRisk({ holdings, stats }) {
  const risk = useMemo(() => {
    const active = holdings.filter(h => h.qty > 0 && h.marketValue > 0);
    const total  = active.reduce((s, h) => s + h.marketValue, 0);
    if (!active.length || !total) return null;

    const weighted = active
      .map(h => ({ ...h, weight: (h.marketValue / total) * 100 }))
      .sort((a, b) => b.weight - a.weight);

    const hhi        = weighted.reduce((s, h) => s + h.weight * h.weight, 0);
    const top1       = weighted[0]?.weight || 0;
    const top3       = weighted.slice(0, 3).reduce((s, h) => s + h.weight, 0);
    const top5       = weighted.slice(0, 5).reduce((s, h) => s + h.weight, 0);
    const sectorMap  = {};
    active.forEach(h => { const s = h.sector || 'Other'; sectorMap[s] = (sectorMap[s] || 0) + h.marketValue; });
    const sectorHHI  = Object.values(sectorMap).map(v => (v / total) * 100).reduce((s, w) => s + w * w, 0);
    const score      = Math.max(0, Math.round(100 - (hhi / 10000) * 100));

    const flags = [];
    if (top1 > 25)              flags.push({ type: 'danger',  msg: `Top holding is ${fmt(top1, 1)}% of portfolio — above 25% single-stock limit` });
    if (top3 > 60)              flags.push({ type: 'warning', msg: `Top 3 holdings = ${fmt(top3, 1)}% — consider spreading capital` });
    if (active.length < 5)     flags.push({ type: 'warning', msg: `Only ${active.length} active positions — aim for 8+` });
    if (sectorHHI > 3000)      flags.push({ type: 'danger',  msg: 'High sector concentration — one sector dominates' });
    if (score > 70)            flags.push({ type: 'success', msg: 'Good diversification across positions' });

    return { weighted, hhi, top1, top3, top5, score, flags, active };
  }, [holdings]);

  if (!risk) return <EmptyFeature icon="⚖️" title="No holdings data" />;

  const scoreColor = risk.score > 70 ? 'var(--green2)' : risk.score > 45 ? 'var(--yellow)' : 'var(--red2)';
  const scoreLabel = risk.score > 70 ? 'Well Diversified' : risk.score > 45 ? 'Moderate Risk' : 'Concentrated';

  return (
    <div className={styles.featureSection}>
      <FeatureHeader icon="⚖️" title="Concentration Risk Score" sub="Herfindahl-Hirschman Index · top-N exposure · single-stock flags" />

      <div className={styles.concentrationLayout}>
        <div className={styles.concentrationGaugeBox}>
          <ConcentrationGauge score={risk.score} color={scoreColor} label={scoreLabel} />
        </div>
        <div className={styles.concentrationMetrics}>
          <div className={styles.metricsGrid4}>
            <MetricCard label="HHI Score" value={Math.round(risk.hhi)}
              color={risk.hhi < 1500 ? 'var(--green2)' : risk.hhi < 3000 ? 'var(--yellow)' : 'var(--red2)'}
              sub="<1500 = diversified" />
            <MetricCard label="Top 1 Holding" value={`${fmt(risk.top1, 1)}%`}
              color={risk.top1 > 25 ? 'var(--red2)' : 'var(--text)'}
              sub={risk.weighted[0]?.symbol} />
            <MetricCard label="Top 3 Exposure" value={`${fmt(risk.top3, 1)}%`}
              color={risk.top3 > 60 ? 'var(--yellow)' : 'var(--text)'} sub="of portfolio" />
            <MetricCard label="Top 5 Exposure" value={`${fmt(risk.top5, 1)}%`}
              color="var(--text)" sub={`${risk.active.length} total positions`} />
          </div>
          <div className={styles.flagsGrid}>
            {risk.flags.map((f, i) => (
              <div key={i} className={styles.flagItem} style={{
                background: f.type === 'danger' ? 'rgba(239,68,68,0.08)' : f.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${f.type === 'danger' ? 'rgba(239,68,68,0.25)' : f.type === 'warning' ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
              }}>
                <span style={{ color: f.type === 'danger' ? 'var(--red2)' : f.type === 'warning' ? 'var(--yellow)' : 'var(--green2)', fontSize: 13 }}>
                  {f.type === 'danger' ? '✕' : f.type === 'warning' ? '⚠' : '✓'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{f.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ChartBox title="Position Weight Distribution">
        <div className={styles.positionBars}>
          {risk.weighted.slice(0, 10).map((h, i) => (
            <div key={i} className={styles.positionBarRow}>
              <div className={styles.positionBarLabel}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>{h.symbol}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{h.sector || 'Other'}</span>
              </div>
              <div className={styles.positionBarTrack}>
                <div className={styles.positionBarFill} style={{
                  width: `${Math.min(100, h.weight)}%`,
                  background: h.weight > 25 ? 'var(--red2)' : h.weight > 15 ? 'var(--yellow)' : sectorColor(h.sector),
                }} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, minWidth: 50, textAlign: 'right',
                color: h.weight > 25 ? 'var(--red2)' : 'var(--text)' }}>
                {fmt(h.weight, 1)}%
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', minWidth: 70, textAlign: 'right' }}>
                {fmtCr(h.marketValue)}
              </div>
            </div>
          ))}
          {risk.weighted.length > 10 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '6px 0' }}>
              +{risk.weighted.length - 10} more positions
            </div>
          )}
        </div>
      </ChartBox>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CAGR WATERFALL BY HOLDING
// ─────────────────────────────────────────────────────────────────────────────

function CAGRWaterfall({ holdings, stats }) {
  const data = useMemo(() => {
    const active = holdings.filter(h => h.qty > 0 && h.marketValue > 0 && h.invested > 0);
    if (!active.length) return null;
    return { sorted: [...active].sort((a, b) => b.cagr - a.cagr), avgCagr: stats.overallCagr };
  }, [holdings, stats]);

  if (!data) return <EmptyFeature icon="📊" title="No active holdings" />;

  const maxAbs = Math.max(...data.sorted.map(h => Math.abs(h.cagr)), Math.abs(data.avgCagr), 1);

  return (
    <div className={styles.featureSection}>
      <FeatureHeader icon="📊" title="CAGR Waterfall by Holding" sub="Individual holding CAGR vs portfolio average — see what's dragging or driving returns" />

      <div className={styles.cagrAvgNote}>
        <span className={styles.cagrAvgDot} />
        Portfolio avg CAGR: <strong style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)' }}>{fmtPct(data.avgCagr, true)}</strong>
      </div>

      <div className={styles.cagrBarsContainer}>
        {data.sorted.map((h, i) => {
          const barPct     = (Math.abs(h.cagr) / maxAbs) * 100;
          const isAboveAvg = h.cagr > data.avgCagr;
          const color      = h.cagr > 15 ? 'var(--green2)' : h.cagr > 5 ? 'var(--teal)' : h.cagr > 0 ? 'var(--yellow)' : 'var(--red2)';
          return (
            <div key={i} className={styles.cagrBarRow}>
              <div className={styles.cagrBarSymbol}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>{h.symbol}</span>
                <span style={{ fontSize: 9, color: 'var(--text3)' }}>{h.assetType}</span>
              </div>
              <div className={styles.cagrBarTrackWrapper}>
                <div className={styles.cagrBarTrack}>
                  <div className={styles.cagrBarFill} style={{ width: `${barPct}%`, background: color }} />
                  <div className={styles.cagrAvgMarker} style={{ left: `${(Math.abs(data.avgCagr) / maxAbs) * 100}%` }} />
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, color, minWidth: 64, textAlign: 'right' }}>
                {fmtPct(h.cagr, true)}
              </div>
              <div style={{ fontSize: 10, color: isAboveAvg ? 'var(--green2)' : 'var(--red2)', minWidth: 60, textAlign: 'right' }}>
                {isAboveAvg ? '▲' : '▼'}{fmt(Math.abs(h.cagr - data.avgCagr), 1)}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', minWidth: 60, textAlign: 'right' }}>
                {fmtCr(h.invested)}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.cagrSummaryRow}>
        <div className={styles.cagrSummaryCard} style={{ borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.06)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green2)', marginBottom: 4 }}>TOP DRIVER</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: 'var(--green2)' }}>{data.sorted[0]?.symbol}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green2)' }}>{fmtPct(data.sorted[0]?.cagr, true)} CAGR</div>
        </div>
        <div className={styles.cagrSummaryCard} style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red2)', marginBottom: 4 }}>BIGGEST DRAG</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: 'var(--red2)' }}>{data.sorted[data.sorted.length - 1]?.symbol}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--red2)' }}>{fmtPct(data.sorted[data.sorted.length - 1]?.cagr, true)} CAGR</div>
        </div>
        <div className={styles.cagrSummaryCard}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 }}>BEATING AVG</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: 'var(--accent2)' }}>
            {data.sorted.filter(h => h.cagr > data.avgCagr).length}/{data.sorted.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>holdings above avg CAGR</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ROLLING XIRR / CAGR CHART
// ─────────────────────────────────────────────────────────────────────────────

function RollingXIRR({ snapshots }) {
  const data = useMemo(() => {
    if (!snapshots || snapshots.length < 2) return null;
    return [...snapshots]
      .sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt))
      .map(s => {
        const mfCagr    = s.mfCagr    ? parseFloat(s.mfCagr)    : null;
        const stCagr    = s.stCagr    ? parseFloat(s.stCagr)    : null;
        const mfInv     = s.mfInvested ? parseFloat(s.mfInvested) : 0;
        const stInv     = s.stInvested ? parseFloat(s.stInvested) : 0;
        const totalInv  = mfInv + stInv;
        const wCagr     = totalInv > 0 ? ((mfCagr || 0) * mfInv + (stCagr || 0) * stInv) / totalInv : null;
        return {
          month: s.snapshotAt.slice(0, 7), date: s.snapshotAt.slice(0, 10),
          mfCagr, stCagr, weightedCagr: wCagr,
          returnPct: parseFloat(s.totalReturnPct),
          totalValue: parseFloat(s.totalValue),
          fundCount: s.fundCount, stockCount: s.stockCount,
        };
      });
  }, [snapshots]);

  if (!data || data.length < 2)
    return <EmptyFeature icon="📈" title="Need at least 2 snapshots" sub="Save snapshots regularly to see how CAGR evolves over time" />;

  const last  = data[data.length - 1];
  const first = data[0];
  const cagrChange = last.weightedCagr != null && first.weightedCagr != null
    ? last.weightedCagr - first.weightedCagr : null;

  const mfBars = data.filter(d => d.mfCagr != null)
    .map(d => ({ label: d.month.slice(5), value: Math.max(0, d.mfCagr), color: 'var(--teal)' }));
  const stBars = data.filter(d => d.stCagr != null)
    .map(d => ({ label: d.month.slice(5), value: Math.max(0, d.stCagr), color: 'var(--purple)' }));

  return (
    <div className={styles.featureSection}>
      <FeatureHeader icon="📈" title="Rolling CAGR Trend" sub="MF CAGR and Stock CAGR evolution captured at each snapshot" />

      <div className={styles.metricsGrid4}>
        <MetricCard label="Latest MF CAGR" value={last.mfCagr != null ? fmtPct(last.mfCagr, true) : '—'} color="var(--teal)" sub={last.date} />
        <MetricCard label="Latest Stock CAGR" value={last.stCagr != null ? fmtPct(last.stCagr, true) : '—'} color="var(--purple)" sub={last.date} />
        <MetricCard label="Combined CAGR" value={last.weightedCagr != null ? fmtPct(last.weightedCagr, true) : '—'} color="var(--accent2)" sub="Weighted avg" />
        <MetricCard label="CAGR Trend" value={cagrChange != null ? `${cagrChange >= 0 ? '+' : ''}${fmt(cagrChange, 1)}%` : '—'}
          color={cagrChange != null ? colorPnl(cagrChange) : 'var(--text2)'} sub="First → latest snapshot" />
      </div>

      <TableBox title="CAGR at Each Snapshot">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>Portfolio Value</th>
              <th style={{ textAlign: 'right' }}>Total Return</th>
              <th style={{ textAlign: 'right' }}>MF CAGR</th>
              <th style={{ textAlign: 'right' }}>Stock CAGR</th>
              <th style={{ textAlign: 'right' }}>Combined CAGR</th>
              <th style={{ textAlign: 'right' }}>Funds</th>
              <th style={{ textAlign: 'right' }}>Stocks</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => {
              const prev      = i > 0 ? data[i - 1] : null;
              const cagrDelta = prev?.weightedCagr != null && d.weightedCagr != null
                ? d.weightedCagr - prev.weightedCagr : null;
              return (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{d.date}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtCr(d.totalValue)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: colorPnl(d.returnPct), fontWeight: 600 }}>{fmtPct(d.returnPct, true)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{d.mfCagr != null ? fmtPct(d.mfCagr, true) : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--purple)' }}>{d.stCagr != null ? fmtPct(d.stCagr, true) : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)' }}>
                    {d.weightedCagr != null ? fmtPct(d.weightedCagr, true) : '—'}
                    {cagrDelta != null && (
                      <span style={{ fontSize: 9, marginLeft: 4, color: colorPnl(cagrDelta) }}>
                        {cagrDelta >= 0 ? '▲' : '▼'}{fmt(Math.abs(cagrDelta), 1)}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{d.fundCount ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>{d.stockCount ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableBox>

      {mfBars.length > 1 && <ChartBox title="MF CAGR Over Snapshots (%)"><BarChart data={mfBars} height={110} /></ChartBox>}
      {stBars.length > 1 && <ChartBox title="Stock CAGR Over Snapshots (%)"><BarChart data={stBars} height={110} /></ChartBox>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. TRADE BEHAVIOR ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

function TradeBehavior({ trades, realizedSummary }) {
  const analysis = useMemo(() => {
    if (!trades.length) return null;

    const buys  = trades.filter(t => t.tradeType === 'BUY');
    const sells = trades.filter(t => t.tradeType === 'SELL');

    // Avg hold before selling from FIFO lot data
    const allLots    = realizedSummary.sells.flatMap(s => s.matchedLots || []);
    const avgHoldDays = allLots.length > 0
      ? Math.round(allLots.reduce((s, l) => s + (l.holdDays || 0), 0) / allLots.length) : null;

    // Buys by symbol for gap analysis
    const buysBySymbol = {};
    buys.forEach(t => {
      if (!buysBySymbol[t.symbol]) buysBySymbol[t.symbol] = [];
      buysBySymbol[t.symbol].push(t.tradeDate);
    });

    // Buy-high / sell-low detection
    let buyHighSellLow = 0, buyHighSellLowValue = 0;
    realizedSummary.sells.forEach(s => {
      (s.matchedLots || []).forEach(lot => {
        if (s.sellPrice < lot.buyPrice) {
          buyHighSellLow++;
          buyHighSellLowValue += (lot.buyPrice - s.sellPrice) * (lot.qty || 1);
        }
      });
    });

    // Trade frequency by day of week
    const dayOfWeek = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 };
    const dayKeys   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    trades.forEach(t => { const d = dayKeys[new Date(t.tradeDate).getDay()]; if (dayOfWeek[d] !== undefined) dayOfWeek[d]++; });

    // Trade size stats
    const tradeSizes   = trades.map(t => parseFloat(t.quantity) * parseFloat(t.price));
    const avgTradeSize = tradeSizes.reduce((s, v) => s + v, 0) / tradeSizes.length;

    // Conviction adds (adding within 30d of initial buy)
    let convictionAdds = 0;
    Object.values(buysBySymbol).forEach(dates => {
      const sorted = [...dates].sort();
      for (let i = 1; i < sorted.length; i++) {
        if ((new Date(sorted[i]) - new Date(sorted[i - 1])) / 864e5 <= 30) convictionAdds++;
      }
    });

    return {
      totalTrades: trades.length, totalBuys: buys.length, totalSells: sells.length,
      avgHoldDays, buyHighSellLow, buyHighSellLowValue, dayOfWeek,
      avgTradeSize, maxTradeSize: Math.max(...tradeSizes), minTradeSize: Math.min(...tradeSizes),
      convictionAdds, uniqueSymbols: Object.keys(buysBySymbol).length,
      avgBuysPerSymbol: buys.length / Math.max(1, Object.keys(buysBySymbol).length),
    };
  }, [trades, realizedSummary]);

  if (!analysis) return <EmptyFeature icon="🔬" title="No trade data" />;

  const maxDay = Math.max(...Object.values(analysis.dayOfWeek), 1);

  return (
    <div className={styles.featureSection}>
      <FeatureHeader icon="🔬" title="Trade Behavior Analysis" sub="Timing patterns, conviction signals, and behavioral biases from trade history" />

      <div className={styles.metricsGrid4}>
        <MetricCard label="Total Trades" value={analysis.totalTrades} color="var(--accent2)"
          sub={`${analysis.totalBuys}B · ${analysis.totalSells}S`} />
        <MetricCard label="Avg Hold Before Sell"
          value={analysis.avgHoldDays != null ? `${analysis.avgHoldDays}d` : '—'}
          color={analysis.avgHoldDays != null && analysis.avgHoldDays >= 365 ? 'var(--green2)' : 'var(--yellow)'}
          sub={analysis.avgHoldDays != null && analysis.avgHoldDays >= 365 ? 'LTCG territory ✓' : 'STCG risk'} />
        <MetricCard label="Buy-High/Sell-Low"
          value={`${analysis.buyHighSellLow} lots`}
          color={analysis.buyHighSellLow > 0 ? 'var(--red2)' : 'var(--green2)'}
          sub={analysis.buyHighSellLow > 0 ? `${fmtCr(analysis.buyHighSellLowValue)} lost` : 'None detected ✓'} />
        <MetricCard label="Conviction Adds" value={analysis.convictionAdds} color="var(--teal)" sub="Added within 30d of buy" />
      </div>

      <div className={styles.behaviorTwoCol}>
        <div className={styles.behaviorCard}>
          <div className={styles.behaviorCardTitle}>Trade Activity by Day of Week</div>
          <div className={styles.dowBars}>
            {Object.entries(analysis.dayOfWeek).map(([day, count]) => {
              const isMax = count === Math.max(...Object.values(analysis.dayOfWeek));
              return (
                <div key={day} className={styles.dowBarRow}>
                  <span className={styles.dowLabel}>{day}</span>
                  <div className={styles.dowTrack}>
                    <div className={styles.dowFill} style={{ width: `${(count / maxDay) * 100}%`, background: isMax ? 'var(--accent2)' : 'var(--surface2)' }} />
                  </div>
                  <span className={styles.dowCount}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.behaviorCard}>
          <div className={styles.behaviorCardTitle}>Trade Size Profile</div>
          <div className={styles.tradeSizeGrid}>
            {[
              { label: 'AVG TRADE',  value: fmtCr(analysis.avgTradeSize), color: 'var(--text)' },
              { label: 'LARGEST',    value: fmtCr(analysis.maxTradeSize),  color: 'var(--green2)' },
              { label: 'SMALLEST',   value: fmtCr(analysis.minTradeSize),  color: 'var(--text2)' },
              { label: 'SYMBOLS',    value: analysis.uniqueSymbols,        color: 'var(--accent2)',
                sub: `${fmt(analysis.avgBuysPerSymbol, 1)} buys/symbol` },
            ].map((m, i) => (
              <div key={i} className={styles.tradeSizeItem}>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.07em', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: m.color }}>{m.value}</div>
                {m.sub && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{m.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {analysis.buyHighSellLow > 0 && (
        <InfoBox borderColor="rgba(239,68,68,0.3)" bg="rgba(239,68,68,0.06)">
          <span style={{ color: 'var(--red2)' }}>⚠</span>
          <span> <strong>{analysis.buyHighSellLow} sell lots</strong> executed below original buy price, losing {fmtCr(analysis.buyHighSellLowValue)} — a classic buy-high/sell-low pattern. Consider limit orders or stop-losses.</span>
        </InfoBox>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORIGINAL PANELS (Realized P&L, Sector Wheel) — kept intact
// ─────────────────────────────────────────────────────────────────────────────

function RealizedPanel({ realizedSummary, portfolioXIRR }) {
  const { sells, ltcgGain, stcgGain, ltcgTax, stcgTax, totalTax, totalRealized, sellsBySymbol } = realizedSummary;
  if (!sells.length) return (
    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
      No realized trades yet — all gains are unrealized.
    </div>
  );
  const winSells  = sells.filter(s => s.realized > 0);
  const lossSells = sells.filter(s => s.realized < 0);
  const winRate   = sells.length > 0 ? (winSells.length / sells.length) * 100 : 0;
  const avgWin    = winSells.length  > 0 ? winSells.reduce((s, x)  => s + x.realized, 0) / winSells.length  : 0;
  const avgLoss   = lossSells.length > 0 ? lossSells.reduce((s, x) => s + x.realized, 0) / lossSells.length : 0;
  const headlines = [
    { label: 'Total Realized',  value: fmtCr(totalRealized), color: colorPnl(totalRealized),  sub: 'All closed positions' },
    { label: 'LTCG Gain',       value: fmtCr(ltcgGain),      color: 'var(--green2)',           sub: '12.5% · held >1yr' },
    { label: 'STCG Gain',       value: fmtCr(stcgGain),      color: 'var(--yellow)',           sub: '20% · held <1yr' },
    { label: 'Tax Liability',   value: fmtCr(totalTax),      color: 'var(--red2)',             sub: 'Est. FY obligation' },
    { label: 'Win Rate',        value: `${fmt(winRate, 0)}%`, color: winRate >= 50 ? 'var(--green2)' : 'var(--red2)', sub: `${winSells.length}W / ${lossSells.length}L` },
    ...(portfolioXIRR != null ? [{ label: 'Portfolio XIRR', value: fmtPct(portfolioXIRR, true), color: 'var(--teal)', sub: 'Money-weighted' }] : []),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={styles.realizedMetricsGrid}>
        {headlines.map((m, i) => (
          <div key={i} className={styles.realizedMetricCell}>
            <div className={styles.realizedMetricLabel}>{m.label}</div>
            <div className={styles.realizedMetricValue} style={{ color: m.color }}>{m.value}</div>
            {m.sub && <div className={styles.realizedMetricSub}>{m.sub}</div>}
          </div>
        ))}
      </div>
      <div className={styles.taxBreakdownGrid}>
        {[
          { label: 'LTCG', gain: ltcgGain, tax: ltcgTax, rate: '12.5%', exemption: '₹1.25L exempt', color: 'var(--green2)', bg: 'rgba(16,185,129,0.06)' },
          { label: 'STCG', gain: stcgGain, tax: stcgTax, rate: '20%',   exemption: 'No exemption',   color: 'var(--yellow)', bg: 'rgba(245,158,11,0.06)' },
        ].map((t, i) => (
          <div key={i} className={styles.taxBreakdownCell} style={{ background: t.bg, border: `1px solid ${t.color}30` }}>
            <div className={styles.taxBreakdownHeader}>
              <span className={styles.taxBreakdownType} style={{ color: t.color }}>{t.label} · {t.rate}</span>
              <span className={styles.taxBreakdownExemption}>{t.exemption}</span>
            </div>
            <div className={styles.taxBreakdownValues}>
              <div className={styles.taxBreakdownItem}>
                <div className={styles.taxBreakdownItemLabel}>Gain</div>
                <div className={styles.taxBreakdownItemValue} style={{ color: t.color }}>{fmtCr(t.gain)}</div>
              </div>
              <div className={styles.taxBreakdownItem}>
                <div className={styles.taxBreakdownItemLabel}>Est. Tax</div>
                <div className={styles.taxBreakdownItemValue} style={{ color: 'var(--red2)' }}>{fmtCr(t.tax)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {(avgWin !== 0 || avgLoss !== 0) && (
        <div className={styles.winLossGrid}>
          <div className={styles.winCell}>
            <div className={styles.winLossLabel} style={{ color: 'var(--green2)' }}>AVG WIN</div>
            <div className={styles.winLossValue} style={{ color: 'var(--green2)' }}>{fmtCr(avgWin)}</div>
            <div className={styles.winLossSub}>per closed winning trade</div>
          </div>
          <div className={styles.lossCell}>
            <div className={styles.winLossLabel} style={{ color: 'var(--red2)' }}>AVG LOSS</div>
            <div className={styles.winLossValue} style={{ color: 'var(--red2)' }}>{fmtCr(avgLoss)}</div>
            <div className={styles.winLossSub}>per closed losing trade</div>
          </div>
        </div>
      )}
      <div className={styles.sellTableWrapper}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Symbol','Sells','Total Proceeds','Realized P&L','LTCG','STCG','Est. Tax'].map((h, i) => (
                <th key={i} style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.07em',
                  padding: '8px 12px', background: 'var(--bg3)', textAlign: i === 0 ? 'left' : 'right',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(sellsBySymbol)
              .sort(([, a], [, b]) => Math.abs(b.realized) - Math.abs(a.realized))
              .map(([sym, d], i) => {
                const ltcg     = d.sells.filter(s => s.taxType === 'LTCG').reduce((s, x) => s + x.realized, 0);
                const stcg     = d.sells.filter(s => s.taxType === 'STCG').reduce((s, x) => s + x.realized, 0);
                const proceeds = d.sells.reduce((s, x) => s + x.qty * x.sellPrice, 0);
                const tax      = (ltcg > 125000 ? (ltcg - 125000) * 0.125 : 0) + (stcg > 0 ? stcg * 0.20 : 0);
                const cell     = { padding: '8px 12px', borderBottom: '1px solid rgba(45,64,96,0.3)' };
                return (
                  <tr key={i}>
                    <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)' }}>{sym}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{d.sells.length}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCr(proceeds)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: colorPnl(d.realized) }}>{fmtCr(d.realized)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>{ltcg !== 0 ? fmtCr(ltcg) : '—'}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{stcg !== 0 ? fmtCr(stcg) : '—'}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red2)' }}>{tax > 0 ? fmtCr(tax) : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {lossSells.length > 0 && (
        <div className={styles.taxInsightBox}>
          <div className={styles.taxInsightTitle}>💡 Tax Insight</div>
          <div className={styles.taxInsightText}>
            You have <strong style={{ color: 'var(--red2)' }}>{fmtCr(Math.abs(lossSells.reduce((s, x) => s + x.realized, 0)))}</strong> in realized
            losses that can offset gains.
            {ltcgGain < 125000 && ltcgGain > 0 && (
              <> LTCG of <strong style={{ color: 'var(--green2)' }}>{fmtCr(ltcgGain)}</strong> is within the ₹1.25L exemption — no LTCG tax owed.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectorDonut({ sectors }) {
  const [hovered, setHovered] = useState(null);
  const size = 230, cx = 115, cy = 115, r = 95, ir = 60;
  const slices = useMemo(() => {
    const result = sectors.reduce((acc, s) => {
      const start = acc.angle;
      const sweep = (s.pct / 100) * 2 * Math.PI;
      const end = start + sweep;
      return {
        angle: end,
        slices: [...acc.slices, { ...s, start, end }],
      };
    }, { angle: -Math.PI / 2, slices: [] });
    return result.slices;
  }, [sectors]);
  function arcPath(s, e, or, ir2) {
    const x1o = cx + or * Math.cos(s), y1o = cy + or * Math.sin(s);
    const x2o = cx + or * Math.cos(e), y2o = cy + or * Math.sin(e);
    const x1i = cx + ir2 * Math.cos(e), y1i = cy + ir2 * Math.sin(e);
    const x2i = cx + ir2 * Math.cos(s), y2i = cy + ir2 * Math.sin(s);
    const lg = e - s > Math.PI ? 1 : 0;
    return `M${x1o},${y1o} A${or},${or},0,${lg},1,${x2o},${y2o} L${x1i},${y1i} A${ir2},${ir2},0,${lg},0,${x2i},${y2i} Z`;
  }
  const hovSector = hovered ? slices.find(s => s.label === hovered) : null;
  const top = slices[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Sector Exposure Wheel</div>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {slices.map((s, i) => {
          const isH = hovered === s.label;
          return (
            <g key={i} onMouseEnter={() => setHovered(s.label)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
              <path d={arcPath(s.start, s.end, isH ? r + 7 : r, ir)} fill={sectorColor(s.label)} opacity={isH ? 1 : 0.82}
                style={{ filter: isH ? `drop-shadow(0 0 8px ${sectorColor(s.label)}80)` : 'none', transition: 'all 0.15s' }} />
            </g>
          );
        })}
        {hovSector ? (
          <>
            <text x={cx} y={cx - 12} textAnchor="middle" fill="var(--text3)" fontSize={9} fontWeight={600}>SECTOR</text>
            <text x={cx} y={cx + 6}  textAnchor="middle" fill={sectorColor(hovSector.label)} fontSize={12} fontWeight={800}>{hovSector.label.slice(0, 10)}</text>
            <text x={cx} y={cx + 22} textAnchor="middle" fill={sectorColor(hovSector.label)} fontSize={16} fontWeight={800} fontFamily="var(--font-mono)">{fmt(hovSector.pct, 1)}%</text>
          </>
        ) : (
          <>
            <text x={cx} y={cx - 12} textAnchor="middle" fill="var(--text3)" fontSize={9} fontWeight={600}>TOP SECTOR</text>
            <text x={cx} y={cx + 6}  textAnchor="middle" fill={sectorColor(top?.label)} fontSize={12} fontWeight={800}>{top?.label?.slice(0, 8)}</text>
            <text x={cx} y={cx + 22} textAnchor="middle" fill={sectorColor(top?.label)} fontSize={16} fontWeight={800} fontFamily="var(--font-mono)">{fmt(top?.pct || 0, 1)}%</text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', marginTop: 8 }}>
        {sectors.slice(0, 6).map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onMouseEnter={() => setHovered(s.label)} onMouseLeave={() => setHovered(null)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: sectorColor(s.label), flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: hovered === s.label ? sectorColor(s.label) : 'var(--text2)' }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color: sectorColor(s.label) }}>{fmt(s.pct, 1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RadarChart({ sectors, equalWeight }) {
  const size = 270, cx = 135, cy = 135, maxR = 105;
  const n = sectors.length;
  if (n < 3) return null;
  function polarToXY(angle, rr) { return { x: cx + rr * Math.cos(angle - Math.PI / 2), y: cy + rr * Math.sin(angle - Math.PI / 2) }; }
  const angles = sectors.map((_, i) => (i / n) * 2 * Math.PI);
  const maxPct = Math.max(...sectors.map(s => s.pct), equalWeight * 2.2, 1);
  const toR    = p => (p / maxPct) * maxR;
  const pPath  = sectors.map((s, i) => { const { x, y } = polarToXY(angles[i], toR(s.pct)); return `${i === 0 ? 'M' : 'L'}${x},${y}`; }).join(' ') + ' Z';
  const bPath  = sectors.map((_, i) => { const { x, y } = polarToXY(angles[i], toR(equalWeight)); return `${i === 0 ? 'M' : 'L'}${x},${y}`; }).join(' ') + ' Z';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Radar vs Equal-Weight</div>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {[0.25, 0.5, 0.75, 1].map((lvl, gi) => {
          const p = sectors.map((_, i) => { const { x, y } = polarToXY(angles[i], maxR * lvl); return `${i === 0 ? 'M' : 'L'}${x},${y}`; }).join(' ') + ' Z';
          return <path key={gi} d={p} fill="none" stroke="rgba(45,64,96,0.5)" strokeWidth={0.8} strokeDasharray={gi < 3 ? '3,3' : 'none'} />;
        })}
        {sectors.map((_, i) => { const { x, y } = polarToXY(angles[i], maxR); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(45,64,96,0.45)" strokeWidth={0.8} />; })}
        <path d={bPath} fill="rgba(96,165,250,0.07)" stroke="rgba(96,165,250,0.55)" strokeWidth={1.5} strokeDasharray="5,3" />
        <path d={pPath} fill="rgba(139,92,246,0.14)" stroke="rgba(139,92,246,0.85)" strokeWidth={2} />
        {sectors.map((s, i) => { const { x, y } = polarToXY(angles[i], toR(s.pct)); return <circle key={i} cx={x} cy={y} r={3.5} fill={sectorColor(s.label)} stroke="var(--bg)" strokeWidth={1} />; })}
        {sectors.map((s, i) => { const { x, y } = polarToXY(angles[i], maxR + 18); return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={sectorColor(s.label)} fontSize={8} fontWeight={700}>{s.label.slice(0, 7)}</text>; })}
      </svg>
    </div>
  );
}

function SectorRotationWheel({ holdings, stats }) {
  const { sectors, equalWeight, sectorCount } = useAnalyticsView({ stats, holdings, taxData: [], monthlyFlow: [], realizedSummary: { sells: [] }, portfolioXIRR: null, portfolioBeta: null }).sectorData;
  const overweightSectors  = sectors.filter(s => s.delta >  2);
  const underweightSectors = sectors.filter(s => s.delta < -2);
  const largestSector      = sectors[0];
  const maxVal             = sectors[0]?.val || 1;
  if (!holdings.length) return null;
  return (
    <div className={styles.sectorSection}>
      <div className={styles.sectorSectionTitle}>Sector Rotation Wheel</div>
      <div className={styles.sectorSectionSub}>Combined MF implied + direct stock exposure · overweight / neutral / underweight vs equal-weight</div>
      <div className={styles.sectorMetricsGrid}>
        {[
          { label: 'SECTORS TRACKED',    value: sectorCount,                               color: 'var(--text)',    sub: 'Active in portfolio' },
          { label: 'LARGEST EXPOSURE',   value: largestSector?.label?.slice(0, 10) || '—', color: sectorColor(largestSector?.label), sub: `${fmt(largestSector?.pct || 0, 1)}% of portfolio` },
          { label: 'OVERWEIGHT SECTORS', value: overweightSectors.length,                  color: '#ef4444',        sub: overweightSectors.slice(0, 3).map(s => s.label.slice(0, 6)).join(', ') || '—' },
          { label: 'UNDERWEIGHT',        value: underweightSectors.length,                 color: '#8b5cf6',        sub: underweightSectors.slice(0, 3).map(s => s.label.slice(0, 6)).join(', ') || '—' },
          { label: 'EQUAL WEIGHT REF',   value: `${fmt(equalWeight, 1)}%`,                 color: 'var(--accent2)', sub: 'Per sector equally split' },
          { label: 'MF IMPLIED',         value: fmtCr(stats.mfValue),                      color: 'var(--teal)',    sub: 'Capital in funds' },
        ].map((m, i) => (
          <div key={i} className={styles.sectorMetricCell}>
            <div className={styles.sectorMetricLabel}>{m.label}</div>
            <div className={styles.sectorMetricValue} style={{ color: m.color }}>{m.value}</div>
            {m.sub && <div className={styles.sectorMetricSub}>{m.sub}</div>}
          </div>
        ))}
      </div>
      <div className={styles.chartsRow}>
        <div className={`glass ${styles.chartPanel}`}><SectorDonut sectors={sectors} /></div>
        <div className={`glass ${styles.chartPanel}`}>
          {sectors.length >= 3 ? <RadarChart sectors={sectors} equalWeight={equalWeight} /> : (
            <div className={styles.radarEmptyState}>
              <div className={styles.radarEmptyTitle}>Radar unlocks at 3 sectors</div>
              <div className={styles.radarEmptyText}>{sectorCount} sector{sectorCount !== 1 ? 's' : ''} so far</div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.legendRow}>
        {[
          { label: 'OVERWEIGHT', color: '#ef4444', desc: 'delta > +5%' },
          { label: 'SLIGHT OW',  color: '#f59e0b', desc: '+2 to +5%'  },
          { label: 'NEUTRAL',    color: '#10b981', desc: '±2%'        },
          { label: 'SLIGHT UW',  color: '#60a5fa', desc: '-2 to -5%'  },
          { label: 'UNDERWEIGHT',color: '#8b5cf6', desc: 'delta < -5%'},
        ].map((s, i) => (
          <div key={i} className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: s.color }} />
            <span className={styles.legendLabel} style={{ color: s.color }}>{s.label}</span>
            <span className={styles.legendDesc}>{s.desc}</span>
          </div>
        ))}
      </div>
      <div className={styles.sectorTableTitle}>Pro-Sector Breakdown with Rotation Signals</div>
      <div className={`glass ${styles.sectorTableWrapper}`}>
        {sectors.map((s, i) => {
          const cls  = classifyDelta(s.delta);
          const icon = SECTOR_ICONS[s.label] || '◦';
          return (
            <div key={i} className={styles.sectorRow} style={{ borderBottom: i < sectors.length - 1 ? '1px solid rgba(45,64,96,0.35)' : 'none' }}>
              <div className={styles.sectorRowHeader}>
                <div className={styles.sectorRowLeft}>
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span className={styles.sectorRowName} style={{ color: sectorColor(s.label) }}>{s.label}</span>
                </div>
                <div className={styles.sectorRowRight}>
                  <span className={styles.sectorRowPct}  style={{ color: sectorColor(s.label) }}>{fmt(s.pct, 1)}%</span>
                  <span className={styles.sectorRowValue}>{fmtCr(s.val)}</span>
                  <span className={styles.sectorSignalBadge} style={{ background: cls.bg, color: cls.color, border: `1px solid ${cls.border}` }}>
                    {s.delta > 0 ? '+' : ''}{fmt(s.delta, 1)}% {cls.label}
                  </span>
                </div>
              </div>
              {s.mfVal > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <div className={styles.barRowHeader}>
                    <span className={styles.barRowLabel} style={{ color: '#14b8a6' }}>MF {fmtCr(s.mfInvested)}</span>
                    <span className={styles.barRowValue} style={{ color: '#14b8a6' }}>{fmtCr(s.mfVal)}</span>
                  </div>
                  <div className={styles.barTrack}><div className={styles.barFillMF} style={{ width: `${Math.min(100, (s.mfVal / maxVal) * 100)}%` }} /></div>
                </div>
              )}
              {s.stVal > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <div className={styles.barRowHeader}>
                    <span className={styles.barRowLabel} style={{ color: '#c084fc' }}>Stock {fmtCr(s.stInvested)}</span>
                    <span className={styles.barRowValue} style={{ color: '#c084fc' }}>{fmtCr(s.stVal)}</span>
                  </div>
                  <div className={styles.barTrack}><div className={styles.barFillStock} style={{ width: `${Math.min(100, (s.stVal / maxVal) * 100)}%` }} /></div>
                </div>
              )}
              <div className={styles.sectorChips}>
                {s.mfVal > 0 && <span className={styles.sectorChip} style={{ color: '#14b8a6', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)' }}>MF {fmt((s.mfVal / s.val) * 100, 0)}%</span>}
                {s.stVal > 0 && <span className={styles.sectorChip} style={{ color: '#c084fc', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>Stocks {fmt((s.stVal / s.val) * 100, 0)}%</span>}
                <span style={{ fontSize: 9, color: 'var(--text3)' }}>EW: {fmt(equalWeight, 1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticsView() {
  const { stats, holdings, taxData, monthlyFlow, realizedSummary,
    portfolioXIRR, portfolioBeta, trades, currentPrices, portfolioId } = usePortfolio();

  const { snapshots, loading: snapsLoading } = useSnapshots(portfolioId);

  const {
    analyticsTab, setAnalyticsTab,
    ltcg, stcg, ltcgInvested, stcgInvested,
    sharpe, unrealizedTax,
  } = useAnalyticsView({ stats, holdings, stHoldings: [], mfHoldings: [], taxData, monthlyFlow, realizedSummary, portfolioXIRR, portfolioBeta });

  const returnMetrics = [
    { label: 'Portfolio XIRR',    value: portfolioXIRR != null ? fmtPct(portfolioXIRR, true) : '—', color: 'var(--green2)', sub: 'True money-weighted' },
    { label: 'Portfolio Beta',    value: portfolioBeta?.beta != null ? fmt(portfolioBeta.beta, 2) : '—', color: 'var(--yellow)', sub: portfolioBeta?.beta != null ? `${fmt(portfolioBeta.coveragePct, 0)}% coverage` : 'Weighted equity risk' },
    { label: 'Approx CAGR',       value: fmtPct(stats.overallCagr * 0.93), color: 'var(--accent2)', sub: 'Time-weighted est.' },
    { label: 'Sharpe Ratio',      value: sharpe,                            color: 'var(--teal)',    sub: 'Risk-adjusted' },
    { label: 'Unrealized Return', value: fmtPct(stats.totalReturnPct),      color: colorPnl(stats.totalReturnPct), sub: 'Open positions' },
    { label: 'Total Realized',    value: fmtCr(realizedSummary.totalRealized), color: colorPnl(realizedSummary.totalRealized), sub: 'Closed positions' },
    { label: 'MF CAGR',           value: fmtPct(stats.mfCagr),             color: 'var(--purple)', sub: 'Weighted avg' },
    { label: 'Stock CAGR',        value: fmtPct(stats.stCagr),             color: 'var(--teal)',   sub: 'Weighted avg' },
  ];

  const TABS = [
    { key: 'overview',      label: '📊 Overview' },
    { key: 'realized',      label: `💰 Realized P&L${realizedSummary.sells.length > 0 ? ` (${realizedSummary.sells.length})` : ''}` },
    { key: 'sectors',       label: '🎯 Sectors' },
    { key: 'yearByYear',    label: '📅 Year-by-Year' },
    { key: 'drawdown',      label: '📉 Drawdown' },
    { key: 'sip',           label: '📆 SIP Tracker' },
    { key: 'concentration', label: '⚖️ Risk Score' },
    { key: 'cagr',          label: '📊 CAGR Waterfall' },
    { key: 'rolling',       label: '📈 Rolling CAGR' },
    { key: 'behavior',      label: '🔬 Trade Behavior' },
  ];

  const snapsLoaded = !snapsLoading;

  return (
    <div className="fade-up">
      <div className={styles.tabBar}>
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setAnalyticsTab(key)}
            className={`${styles.tabBtn} ${analyticsTab === key ? styles.tabBtnActive : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {analyticsTab === 'overview' && (
        <>
          <div className={`glass ${styles.returnMetricsPanel}`}>
            <div className={styles.panelTitle}>Return Metrics</div>
            <div className={styles.panelSub}>Unrealized + realized — combined picture</div>
            <div className={styles.metricsGrid}>
              {returnMetrics.map((m, i) => <StatCard key={i} flip label={m.label} value={m.value} color={m.color} sub={m.sub} valueSize={22} />)}
            </div>
          </div>
          <div className={styles.twoCol}>
            <BenchmarkComparisonPanel snapshots={snapshots} stats={stats} />
            <div className="glass" style={{ padding: 18 }}>
              <div className={styles.panelTitle}>Unrealized Tax Exposure</div>
              <div className={styles.panelSub}>Tax if sold today · LTCG 12.5% · STCG 20%</div>
              <div className={styles.taxGrid}>
                <div className={styles.taxCell}>
                  <div className={styles.taxCellLabel}>LTCG Holdings</div>
                  <div className={styles.taxCellValue}>{ltcg.length}</div>
                  <div className={styles.taxCellSub}>{fmtCr(ltcgInvested)} invested</div>
                </div>
                <div className={styles.taxCell}>
                  <div className={styles.taxCellLabel}>STCG Holdings</div>
                  <div className={styles.taxCellValue} style={{ color: 'var(--yellow)' }}>{stcg.length}</div>
                  <div className={styles.taxCellSub}>{fmtCr(stcgInvested)} invested</div>
                </div>
              </div>
              <div className={styles.unrealizedTaxBox}>
                <div className={styles.unrealizedTaxLabel}>If Sold Today (Unrealized Tax)</div>
                <div className={styles.unrealizedTaxValue}>{fmtCr(unrealizedTax)}</div>
              </div>
              {realizedSummary.totalTax > 0 && (
                <div className={styles.realizedTaxBox}>
                  <div className={styles.realizedTaxLabel}>Already Realized Tax</div>
                  <div className={styles.realizedTaxValue}>{fmtCr(realizedSummary.totalTax)}</div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.flowDistRow}>
            <div className="glass" style={{ padding: 18 }}>
              <div className={styles.panelTitle}>Holding Period Distribution</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <HBar label={`LTCG >1yr · ${ltcg.length} assets`} value={ltcgInvested} max={stats.totalInvested} color="#34d399" sub={fmtCr(ltcgInvested)} />
                <HBar label={`STCG <1yr · ${stcg.length} assets`} value={stcgInvested} max={stats.totalInvested} color="#f59e0b" sub={fmtCr(stcgInvested)} />
              </div>
              <div className={styles.divider} />
              <div className={styles.holdingDistNote}>LTCG exemption: gains below ₹1.25L/year are tax-free.</div>
            </div>
          </div>
        </>
      )}

      {analyticsTab === 'realized' && (
        <div className="glass" style={{ padding: 20 }}>
          <div className={styles.realizedTitle}>Realized P&amp;L — FIFO Accounting</div>
          <div className={styles.realizedSub}>Gains computed using First-In-First-Out lot matching.</div>
          <RealizedPanel realizedSummary={realizedSummary} portfolioXIRR={portfolioXIRR} />
        </div>
      )}

      {analyticsTab === 'sectors' && (
        <div className="glass"><SectorRotationWheel holdings={holdings} stats={stats} /></div>
      )}

      {analyticsTab === 'yearByYear' && (
        <div className="glass" style={{ padding: 20 }}>
          {snapsLoading
            ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>Loading snapshots…</div>
            : <YearByYearView snapshots={snapshots} trades={trades} />}
        </div>
      )}

      {/* ── New Tabs ── */}
      {analyticsTab === 'drawdown' && (
        <div className="glass" style={{ padding: 20 }}>
          {snapsLoading
            ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>Loading snapshots…</div>
            : <DrawdownAnalysis snapshots={snapshots} />}
        </div>
      )}

      {analyticsTab === 'sip' && (
        <div className="glass" style={{ padding: 20 }}>
          <SIPPerformance trades={trades} holdings={holdings} />
        </div>
      )}

      {analyticsTab === 'concentration' && (
        <div className="glass" style={{ padding: 20 }}>
          <ConcentrationRisk holdings={holdings} stats={stats} />
        </div>
      )}

      {analyticsTab === 'cagr' && (
        <div className="glass" style={{ padding: 20 }}>
          <CAGRWaterfall holdings={holdings} stats={stats} />
        </div>
      )}

      {analyticsTab === 'rolling' && (
        <div className="glass" style={{ padding: 20 }}>
          {snapsLoading
            ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>Loading snapshots…</div>
            : <RollingXIRR snapshots={snapshots} />}
        </div>
      )}

      {analyticsTab === 'behavior' && (
        <div className="glass" style={{ padding: 20 }}>
          <TradeBehavior trades={trades} realizedSummary={realizedSummary} />
        </div>
      )}
    </div>
  );
}
