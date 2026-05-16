'use client';

import { useState, useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor } from '@/lib/store';
import { BarChart, HBar } from '@/components/charts/Charts';
import { StatCard } from '@/components/ui/SharedUI';
import { useAnalyticsView } from '@/hooks/useAnalyticsView';
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

// ── Realized P&L Panel ────────────────────────────────────────────────────────

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

      {/* Headline metrics */}
      <div className={styles.realizedMetricsGrid}>
        {headlines.map((m, i) => (
          <div key={i} className={styles.realizedMetricCell}>
            <div className={styles.realizedMetricLabel}>{m.label}</div>
            <div className={styles.realizedMetricValue} style={{ color: m.color }}>{m.value}</div>
            {m.sub && <div className={styles.realizedMetricSub}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tax breakdown */}
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

      {/* Win/loss stats */}
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

      {/* Per-symbol table */}
      <div className={styles.sellTableWrapper}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Symbol','Sells','Total Proceeds','Realized P&L','LTCG','STCG','Est. Tax'].map((h, i) => (
                <th key={i} style={{
                  fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.07em',
                  padding: '8px 12px', background: 'var(--bg3)', textAlign: i === 0 ? 'left' : 'right',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                }}>{h}</th>
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
                const cell = { padding: '8px 12px', borderBottom: '1px solid rgba(45,64,96,0.3)' };
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

      {/* Tax insight */}
      {lossSells.length > 0 && (
        <div className={styles.taxInsightBox}>
          <div className={styles.taxInsightTitle}>💡 Tax Insight</div>
          <div className={styles.taxInsightText}>
            You have <strong style={{ color: 'var(--red2)' }}>{fmtCr(Math.abs(lossSells.reduce((s, x) => s + x.realized, 0)))}</strong> in realized
            losses that can be used to offset gains.
            {ltcgGain < 125000 && ltcgGain > 0 && (
              <> Your LTCG of <strong style={{ color: 'var(--green2)' }}>{fmtCr(ltcgGain)}</strong> is within the ₹1.25L exemption — no LTCG tax owed.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sector Donut ──────────────────────────────────────────────────────────────

function SectorDonut({ sectors, totalVal }) {
  const [hovered, setHovered] = useState(null);
  const size = 230, cx = 115, cy = 115, r = 95, ir = 60;

  const slices = useMemo(() => {
    const initialAngle = -Math.PI / 2;
    return sectors.reduce((acc, s) => {
      const start = acc.angle;
      const sweep = (s.pct / 100) * 2 * Math.PI;
      const end = start + sweep;
      return { angle: end, slices: [...acc.slices, { ...s, start, sweep, end }] };
    }, { angle: initialAngle, slices: [] }).slices;
  }, [sectors]);

  function arcPath(startA, endA, outerR, innerR) {
    const x1o = cx + outerR * Math.cos(startA), y1o = cy + outerR * Math.sin(startA);
    const x2o = cx + outerR * Math.cos(endA),   y2o = cy + outerR * Math.sin(endA);
    const x1i = cx + innerR * Math.cos(endA),   y1i = cy + innerR * Math.sin(endA);
    const x2i = cx + innerR * Math.cos(startA), y2i = cy + innerR * Math.sin(startA);
    const lg  = endA - startA > Math.PI ? 1 : 0;
    return `M${x1o},${y1o} A${outerR},${outerR},0,${lg},1,${x2o},${y2o} L${x1i},${y1i} A${innerR},${innerR},0,${lg},0,${x2i},${y2i} Z`;
  }

  const topSector = sectors[0];
  const hovSector = hovered ? sectors.find(s => s.label === hovered) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>
        Sector Exposure Wheel — Combined MF + Stocks
      </div>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {slices.map((s, i) => {
          const isHov  = hovered === s.label;
          const outerR = isHov ? r + 7 : r;
          return (
            <g key={i} onMouseEnter={() => setHovered(s.label)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
              <path d={arcPath(s.start, s.end, outerR, ir)} fill={sectorColor(s.label)} opacity={isHov ? 1 : 0.82}
                style={{ filter: isHov ? `drop-shadow(0 0 8px ${sectorColor(s.label)}80)` : 'none', transition: 'all 0.15s' }} />
            </g>
          );
        })}
        {hovSector ? (
          <>
            <text x={cx} y={cx - 12} textAnchor="middle" fill="var(--text3)" fontSize={9} fontWeight={600} letterSpacing={1}>SECTOR</text>
            <text x={cx} y={cx + 6}  textAnchor="middle" fill={sectorColor(hovSector.label)} fontSize={12} fontWeight={800}>{hovSector.label.slice(0, 10)}</text>
            <text x={cx} y={cx + 22} textAnchor="middle" fill={sectorColor(hovSector.label)} fontSize={16} fontWeight={800} fontFamily="var(--font-mono)">{fmt(hovSector.pct, 1)}%</text>
            <text x={cx} y={cx + 36} textAnchor="middle" fill="var(--text3)" fontSize={9}>{fmtCr(hovSector.val)}</text>
          </>
        ) : (
          <>
            <text x={cx} y={cx - 12} textAnchor="middle" fill="var(--text3)" fontSize={9} fontWeight={600} letterSpacing={1}>TOP SECTOR</text>
            <text x={cx} y={cx + 6}  textAnchor="middle" fill={sectorColor(topSector?.label)} fontSize={12} fontWeight={800}>{topSector?.label?.slice(0, 8)}</text>
            <text x={cx} y={cx + 22} textAnchor="middle" fill={sectorColor(topSector?.label)} fontSize={16} fontWeight={800} fontFamily="var(--font-mono)">{fmt(topSector?.pct || 0, 1)}%</text>
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
        {sectors.length > 6 && (
          <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center' }}>+{sectors.length - 6} more sectors — hover wheel to explore</div>
        )}
      </div>
    </div>
  );
}

// ── Radar Chart ───────────────────────────────────────────────────────────────

function RadarChart({ sectors, equalWeight }) {
  const size = 270, cx = 135, cy = 135, maxR = 105;
  const n = sectors.length;
  if (n < 3) return null;

  function polarToXY(angle, rr) {
    return { x: cx + rr * Math.cos(angle - Math.PI / 2), y: cy + rr * Math.sin(angle - Math.PI / 2) };
  }

  const angles  = sectors.map((_, i) => (i / n) * 2 * Math.PI);
  const maxPct  = Math.max(...sectors.map(s => s.pct), equalWeight * 2.2, 1);
  const toR     = pct => (pct / maxPct) * maxR;

  const portfolioPath = sectors.map((s, i) => {
    const { x, y } = polarToXY(angles[i], toR(s.pct));
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ' Z';

  const benchmarkPath = sectors.map((_, i) => {
    const { x, y } = polarToXY(angles[i], toR(equalWeight));
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') + ' Z';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>
        Radar — Actual vs Equal-Weight Benchmark
      </div>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {[0.25, 0.5, 0.75, 1.0].map((lvl, gi) => {
          const rp = sectors.map((_, i) => {
            const { x, y } = polarToXY(angles[i], maxR * lvl);
            return `${i === 0 ? 'M' : 'L'}${x},${y}`;
          }).join(' ') + ' Z';
          return <path key={gi} d={rp} fill="none" stroke="rgba(45,64,96,0.5)" strokeWidth={0.8} strokeDasharray={gi < 3 ? '3,3' : 'none'} />;
        })}
        {sectors.map((_, i) => {
          const { x, y } = polarToXY(angles[i], maxR);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(45,64,96,0.45)" strokeWidth={0.8} />;
        })}
        <path d={benchmarkPath} fill="rgba(96,165,250,0.07)" stroke="rgba(96,165,250,0.55)" strokeWidth={1.5} strokeDasharray="5,3" />
        <path d={portfolioPath} fill="rgba(139,92,246,0.14)" stroke="rgba(139,92,246,0.85)" strokeWidth={2} />
        {sectors.map((s, i) => {
          const { x, y } = polarToXY(angles[i], toR(s.pct));
          return <circle key={i} cx={x} cy={y} r={3.5} fill={sectorColor(s.label)} stroke="var(--bg)" strokeWidth={1} />;
        })}
        {sectors.map((s, i) => {
          const { x, y } = polarToXY(angles[i], maxR + 18);
          return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={sectorColor(s.label)} fontSize={8} fontWeight={700}>{s.label.slice(0, 7)}</text>;
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 16, height: 2, background: 'rgba(139,92,246,0.85)', borderRadius: 1 }} />
          <span style={{ fontSize: 9, color: 'var(--text2)' }}>Your portfolio %</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width={16} height={4}><line x1={0} y1={2} x2={16} y2={2} stroke="rgba(96,165,250,0.6)" strokeWidth={1.5} strokeDasharray="4,2" /></svg>
          <span style={{ fontSize: 9, color: 'var(--text2)' }}>Equal-weight benchmark</span>
        </div>
      </div>
    </div>
  );
}

// ── Sector Rotation Section ───────────────────────────────────────────────────

function RadarChartEmptyState({ sectorCount }) {
  return (
    <div className={styles.radarEmptyState}>
      <div className={styles.radarEmptyTitle}>Radar unlocks at 3 sectors</div>
      <div className={styles.radarEmptyText}>
        {sectorCount ? `${sectorCount} sector${sectorCount === 1 ? '' : 's'} tracked so far` : 'No sector exposure yet'}
      </div>
    </div>
  );
}

function SectorRotationWheel({ holdings, stats }) {
  const { sectors, equalWeight, sectorCount } = useAnalyticsView({ stats, holdings, taxData: [], monthlyFlow: [], realizedSummary: { sells: [] }, portfolioXIRR: null, portfolioBeta: null }).sectorData;

  const overweightSectors  = sectors.filter(s => s.delta >  2);
  const underweightSectors = sectors.filter(s => s.delta < -2);
  const largestSector      = sectors[0];
  const maxVal             = sectors[0]?.val || 1;
  const canRenderRadar     = sectors.length >= 3;

  if (!holdings.length) return null;

  const metricCards = [
    { label: 'SECTORS TRACKED',    value: sectorCount,                                sub: 'Active in your portfolio',                                                     color: 'var(--text)' },
    { label: 'LARGEST EXPOSURE',   value: largestSector?.label?.slice(0, 10) || '—',  sub: `${fmt(largestSector?.pct || 0, 1)}% of portfolio`,                             color: sectorColor(largestSector?.label) },
    { label: 'OVERWEIGHT SECTORS', value: overweightSectors.length,                   sub: overweightSectors.slice(0, 3).map(s => s.label.slice(0, 6)).join(', ') || '—', color: '#ef4444' },
    { label: 'UNDERWEIGHT',        value: underweightSectors.length,                  sub: underweightSectors.slice(0, 3).map(s => s.label.slice(0, 6)).join(', ') || '—', color: '#8b5cf6' },
    { label: 'EQUAL WEIGHT REF',   value: `${fmt(equalWeight, 1)}%`,                  sub: 'Per sector, if equally split',                                                  color: 'var(--accent2)' },
    { label: 'MF IMPLIED',         value: fmtCr(stats.mfValue),                       sub: 'Capital in funds',                                                              color: 'var(--teal)' },
  ];

  const legendItems = [
    { label: 'OVERWEIGHT',  color: '#ef4444', desc: 'delta > +5%' },
    { label: 'SLIGHT OW',   color: '#f59e0b', desc: '+2 to +5%'   },
    { label: 'NEUTRAL',     color: '#10b981', desc: '±2%'         },
    { label: 'SLIGHT UW',   color: '#60a5fa', desc: '-2 to -5%'   },
    { label: 'UNDERWEIGHT', color: '#8b5cf6', desc: 'delta < -5%' },
  ];

  return (
    <div className={styles.sectorSection}>
      <div>
        <div className={styles.sectorSectionTitle}>Sector Rotation Wheel</div>
        <div className={styles.sectorSectionSub}>
          Combined MF implied + direct stock sector exposure · overweight / neutral / underweight vs equal-weight benchmark
        </div>
      </div>

      <div className={styles.sectorMetricsGrid}>
        {metricCards.map((m, i) => (
          <div key={i} className={styles.sectorMetricCell}>
            <div className={styles.sectorMetricLabel}>{m.label}</div>
            <div className={styles.sectorMetricValue} style={{ color: m.color }}>{m.value}</div>
            {m.sub && <div className={styles.sectorMetricSub}>{m.sub}</div>}
          </div>
        ))}
      </div>

      <div className={styles.chartsRow}>
        <div className={`glass ${styles.chartPanel}`}><SectorDonut sectors={sectors} totalVal={stats.totalValue || 1} /></div>
        <div className={`glass ${styles.chartPanel}`}>
          {canRenderRadar ? (
            <RadarChart sectors={sectors} equalWeight={equalWeight} />
          ) : (
            <RadarChartEmptyState sectorCount={sectorCount} />
          )}
        </div>
      </div>

      <div className={styles.legendRow}>
        {legendItems.map((s, i) => (
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
                    <span className={styles.barRowLabel} style={{ color: '#14b8a6' }}>MF Invested: {fmtCr(s.mfInvested)}</span>
                    <span className={styles.barRowValue} style={{ color: '#14b8a6' }}>{fmtCr(s.mfVal)} value</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFillMF} style={{ width: `${Math.min(100, (s.mfVal / maxVal) * 100)}%` }} />
                  </div>
                </div>
              )}

              {s.stVal > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <div className={styles.barRowHeader}>
                    <span className={styles.barRowLabel} style={{ color: '#c084fc' }}>Stock Invested: {fmtCr(s.stInvested)}</span>
                    <span className={styles.barRowValue} style={{ color: '#c084fc' }}>{fmtCr(s.stVal)} value</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFillStock} style={{ width: `${Math.min(100, (s.stVal / maxVal) * 100)}%` }} />
                  </div>
                </div>
              )}

              <div className={styles.sectorChips}>
                {s.mfVal > 0 && <span className={styles.sectorChip} style={{ color: '#14b8a6', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)' }}>MF {fmt((s.mfVal / s.val) * 100, 0)}% · {fmtCr(s.mfVal)}</span>}
                {s.stVal > 0 && <span className={styles.sectorChip} style={{ color: '#c084fc', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>Stocks {fmt((s.stVal / s.val) * 100, 0)}% · {fmtCr(s.stVal)}</span>}
                <span style={{ fontSize: 9, color: 'var(--text3)' }}>EW benchmark: {fmt(equalWeight, 1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnalyticsView() {
  const { stats, holdings, taxData, monthlyFlow, realizedSummary, portfolioXIRR, portfolioBeta } = usePortfolio();
  const {
    analyticsTab, setAnalyticsTab,
    ltcg, stcg, ltcgInvested, stcgInvested,
    flowBars, sharpe, unrealizedTax,
    BENCHMARKS,
  } = useAnalyticsView({ stats, holdings, stHoldings: [], mfHoldings: [], taxData, monthlyFlow, realizedSummary, portfolioXIRR, portfolioBeta });

  const returnMetrics = [
    { label: 'Portfolio XIRR',    value: portfolioXIRR != null ? fmtPct(portfolioXIRR, true) : '—', color: 'var(--green2)',           sub: 'True money-weighted' },
    { label: 'Portfolio Beta',    value: portfolioBeta?.beta != null ? fmt(portfolioBeta.beta, 2) : '—', color: 'var(--yellow)', sub: portfolioBeta?.beta != null ? `${fmt(portfolioBeta.coveragePct, 0)}% coverage` : 'Weighted equity risk' },
    { label: 'Approx CAGR',       value: fmtPct(stats.overallCagr * 0.93),                          color: 'var(--accent2)',           sub: 'Time-weighted est.'  },
    { label: 'Sharpe Ratio',      value: sharpe,                                                     color: 'var(--teal)',             sub: 'Risk-adjusted'       },
    { label: 'Unrealized Return', value: fmtPct(stats.totalReturnPct),                               color: colorPnl(stats.totalReturnPct), sub: 'Open positions'  },
    { label: 'Total Realized',    value: fmtCr(realizedSummary.totalRealized),                       color: colorPnl(realizedSummary.totalRealized), sub: 'Closed positions' },
    { label: 'MF CAGR',           value: fmtPct(stats.mfCagr),                                      color: 'var(--purple)',           sub: 'Weighted avg'        },
    { label: 'Stock CAGR',        value: fmtPct(stats.stCagr),                                      color: 'var(--teal)',             sub: 'Weighted avg'        },
  ];

  return (
    <div className="fade-up">
      {/* Tabs */}
      <div className={styles.tabBar}>
        {[
          ['overview', '📊 Overview'],
          ['realized', `💰 Realized P&L${realizedSummary.sells.length > 0 ? ` (${realizedSummary.sells.length})` : ''}`],
          ['sectors',  '🎯 Sectors'],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setAnalyticsTab(k)}
            className={`${styles.tabBtn} ${analyticsTab === k ? styles.tabBtnActive : ''}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {analyticsTab === 'overview' && (
        <>
          <div className={`glass ${styles.returnMetricsPanel}`}>
            <div className={styles.panelTitle}>Return Metrics</div>
            <div className={styles.panelSub}>Unrealized + realized — combined picture</div>
            <div className={styles.metricsGrid}>
              {returnMetrics.map((m, i) => (
                <StatCard key={i} flip label={m.label} value={m.value} color={m.color} sub={m.sub} valueSize={22} />
              ))}
            </div>
          </div>

          <div className={styles.twoCol}>
            {/* Benchmark */}
            <div className="glass" style={{ padding: 18 }}>
              <div className={styles.panelTitle}>Benchmark Comparison</div>
              <div className={`${styles.panelSub} ${styles.benchmarkNote}`}>⚠ Benchmark figures as of Jan 2025 — may diverge</div>
              <table>
                <thead><tr><th>Benchmark</th><th>5Y CAGR</th><th>3Y CAGR</th><th>1Y Return</th></tr></thead>
                <tbody>
                  {BENCHMARKS.map((b, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{b.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr5y}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr3y}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr1y}%</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(59,130,246,0.08)' }}>
                    <td style={{ fontWeight: 700, color: 'var(--accent2)' }}>Your Portfolio</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green2)', fontWeight: 700 }}>{fmt(stats.overallCagr, 1)}%</td>
                    <td colSpan={2} style={{ color: 'var(--text3)', fontSize: 12 }}>Estimated</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tax exposure */}
            <div className="glass" style={{ padding: 18 }}>
              <div className={styles.panelTitle}>Unrealized Tax Exposure</div>
              <div className={styles.panelSub}>Tax if you sold all open positions today · LTCG 12.5% (&gt;1yr, &gt;₹1.25L) · STCG 20% (&lt;1yr)</div>
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
              <div className={styles.panelTitle}>Monthly Investment Flow</div>
              {flowBars.length > 0
                ? <BarChart data={flowBars} height={120} />
                : <div style={{ color: 'var(--text3)', fontSize: 12 }}>No data</div>
              }
            </div>
            <div className="glass" style={{ padding: 18 }}>
              <div className={styles.panelTitle}>Holding Period Distribution</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <HBar label={`LTCG — >1 yr (12.5% tax) · ${ltcg.length} assets`} value={ltcgInvested} max={stats.totalInvested} color="#34d399" sub={fmtCr(ltcgInvested)} />
                <HBar label={`STCG — <1 yr (20% tax) · ${stcg.length} assets`}   value={stcgInvested} max={stats.totalInvested} color="#f59e0b" sub={fmtCr(stcgInvested)} />
              </div>
              <div className={styles.divider} />
              <div className={styles.holdingDistNote}>
                LTCG exemption: gains below ₹1.25L/year are tax-free. Book profits strategically before year-end.
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Realized tab ── */}
      {analyticsTab === 'realized' && (
        <div className="glass" style={{ padding: 20 }}>
          <div className={styles.realizedTitle}>Realized P&amp;L — FIFO Accounting</div>
          <div className={styles.realizedSub}>Gains computed using First-In-First-Out lot matching. LTCG/STCG classified per lot holding period.</div>
          <RealizedPanel realizedSummary={realizedSummary} portfolioXIRR={portfolioXIRR} />
        </div>
      )}

      {/* ── Sectors tab ── */}
      {analyticsTab === 'sectors' && (
        <div className="glass">
          <SectorRotationWheel holdings={holdings} stats={stats} />
        </div>
      )}
    </div>
  );
}
