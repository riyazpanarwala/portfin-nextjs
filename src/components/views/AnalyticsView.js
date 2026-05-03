'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, sectorColor, SECTOR_COLORS } from '@/lib/store';
import { BarChart, LineChart, HBar } from '@/components/charts/Charts';
import { useMemo, useState } from 'react';

const BENCHMARKS = [
  { name: 'Nifty 50',       cagr5y: 14.2, cagr3y: 12.8, cagr1y: 8.5 },
  { name: 'Sensex',         cagr5y: 13.9, cagr3y: 12.4, cagr1y: 8.1 },
  { name: 'Nifty Midcap',   cagr5y: 18.4, cagr3y: 17.2, cagr1y: 14.1 },
  { name: 'Nifty Smallcap', cagr5y: 22.1, cagr3y: 19.8, cagr1y: 16.5 },
];

function classifyDelta(delta) {
  if (delta >  5) return { label: 'OVERWEIGHT',  color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)' };
  if (delta >  2) return { label: 'SLIGHT OW',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' };
  if (delta > -2) return { label: 'NEUTRAL',     color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' };
  if (delta > -5) return { label: 'SLIGHT UW',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.35)' };
  return           { label: 'UNDERWEIGHT',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' };
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
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
      No realized trades yet — all gains are unrealized.
    </div>
  );

  const winSells  = sells.filter(s => s.realized > 0);
  const lossSells = sells.filter(s => s.realized < 0);
  const winRate   = sells.length > 0 ? (winSells.length / sells.length) * 100 : 0;
  const avgWin    = winSells.length  > 0 ? winSells.reduce((s, x) => s + x.realized, 0)  / winSells.length  : 0;
  const avgLoss   = lossSells.length > 0 ? lossSells.reduce((s, x) => s + x.realized, 0) / lossSells.length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Headline metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
        {[
          { label: 'Total Realized',  value: fmtCr(totalRealized),  color: colorPnl(totalRealized),  note: 'All closed positions' },
          { label: 'LTCG Gain',       value: fmtCr(ltcgGain),       color: 'var(--green2)',           note: '12.5% · held >1yr' },
          { label: 'STCG Gain',       value: fmtCr(stcgGain),       color: 'var(--yellow)',           note: '20% · held <1yr' },
          { label: 'Tax Liability',   value: fmtCr(totalTax),       color: 'var(--red2)',             note: 'Est. FY obligation' },
          { label: 'Win Rate',        value: `${fmt(winRate, 0)}%`,  color: winRate >= 50 ? 'var(--green2)' : 'var(--red2)', note: `${winSells.length}W / ${lossSells.length}L` },
          ...(portfolioXIRR != null ? [{ label: 'Portfolio XIRR', value: fmtPct(portfolioXIRR, true), color: 'var(--teal)', note: 'Money-weighted' }] : []),
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{m.note}</div>
          </div>
        ))}
      </div>

      {/* Tax breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          { label: 'LTCG',  gain: ltcgGain, tax: ltcgTax, rate: '12.5%', exemption: '₹1.25L exempt', color: 'var(--green2)', bg: 'rgba(16,185,129,0.06)' },
          { label: 'STCG',  gain: stcgGain, tax: stcgTax, rate: '20%',   exemption: 'No exemption',   color: 'var(--yellow)', bg: 'rgba(245,158,11,0.06)' },
        ].map((t, i) => (
          <div key={i} style={{ background: t.bg, border: `1px solid ${t.color}30`, borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: t.color }}>{t.label} · {t.rate}</span>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{t.exemption}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Gain</div>
                <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: t.color }}>{fmtCr(t.gain)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Est. Tax</div>
                <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--red2)' }}>{fmtCr(t.tax)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Win/loss stats */}
      {(avgWin !== 0 || avgLoss !== 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '10px', color: 'var(--green2)', fontWeight: '700', marginBottom: '4px' }}>AVG WIN</div>
            <div style={{ fontSize: '16px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>{fmtCr(avgWin)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>per closed winning trade</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '10px', color: 'var(--red2)', fontWeight: '700', marginBottom: '4px' }}>AVG LOSS</div>
            <div style={{ fontSize: '16px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--red2)' }}>{fmtCr(avgLoss)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>per closed losing trade</div>
          </div>
        </div>
      )}

      {/* Per-symbol realized breakdown */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Symbol', 'Sells', 'Total Proceeds', 'Realized P&L', 'LTCG', 'STCG', 'Est. Tax'].map((h, i) => (
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
                const ltcg = d.sells.filter(s => s.taxType === 'LTCG').reduce((s, x) => s + x.realized, 0);
                const stcg = d.sells.filter(s => s.taxType === 'STCG').reduce((s, x) => s + x.realized, 0);
                const proceeds = d.sells.reduce((s, x) => s + x.qty * x.sellPrice, 0);
                const tax = (ltcg > 125000 ? (ltcg - 125000) * 0.125 : 0) + (stcg > 0 ? stcg * 0.20 : 0);
                return (
                  <tr key={i}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)', borderBottom: '1px solid rgba(45,64,96,0.3)' }}>{sym}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)', borderBottom: '1px solid rgba(45,64,96,0.3)' }}>{d.sells.length}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', borderBottom: '1px solid rgba(45,64,96,0.3)' }}>{fmtCr(proceeds)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: colorPnl(d.realized), borderBottom: '1px solid rgba(45,64,96,0.3)' }}>{fmtCr(d.realized)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green2)', borderBottom: '1px solid rgba(45,64,96,0.3)' }}>{ltcg !== 0 ? fmtCr(ltcg) : '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--yellow)', borderBottom: '1px solid rgba(45,64,96,0.3)' }}>{stcg !== 0 ? fmtCr(stcg) : '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--red2)', borderBottom: '1px solid rgba(45,64,96,0.3)' }}>{tax > 0 ? fmtCr(tax) : '—'}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Harvesting opportunities */}
      {lossSells.length > 0 && (
        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent2)', marginBottom: '6px' }}>
            💡 Tax Insight
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.7' }}>
            You have <strong style={{ color: 'var(--red2)' }}>{fmtCr(Math.abs(lossSells.reduce((s, x) => s + x.realized, 0)))}</strong> in realized losses that can be used to offset gains.
            {ltcgGain < 125000 && ltcgGain > 0 && (
              <> Your LTCG of <strong style={{ color: 'var(--green2)' }}>{fmtCr(ltcgGain)}</strong> is within the ₹1.25L exemption — no LTCG tax owed.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sector Donut wheel ────────────────────────────────────────────────────────
function SectorDonut({ sectors, totalVal }) {
  const [hovered, setHovered] = useState(null);
  const size = 230, cx = 115, cy = 115, r = 95, ir = 60;

  const slices = useMemo(() => {
    let angle = -Math.PI / 2;
    return sectors.map(s => {
      const start = angle;
      const sweep = (s.pct / 100) * 2 * Math.PI;
      angle += sweep;
      return { ...s, start, sweep, end: angle };
    });
  }, [sectors]);

  function arcPath(startA, endA, outerR, innerR) {
    const x1o = cx + outerR * Math.cos(startA), y1o = cy + outerR * Math.sin(startA);
    const x2o = cx + outerR * Math.cos(endA),   y2o = cy + outerR * Math.sin(endA);
    const x1i = cx + innerR * Math.cos(endA),   y1i = cy + innerR * Math.sin(endA);
    const x2i = cx + innerR * Math.cos(startA), y2i = cy + innerR * Math.sin(startA);
    const lg = endA - startA > Math.PI ? 1 : 0;
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
          const isHov = hovered === s.label;
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

// ── Radar chart ───────────────────────────────────────────────────────────────
function RadarChart({ sectors, equalWeight }) {
  const size = 270, cx = 135, cy = 135, maxR = 105;
  const n = sectors.length;
  if (n < 3) return null;

  function polarToXY(angle, rr) {
    return { x: cx + rr * Math.cos(angle - Math.PI / 2), y: cy + rr * Math.sin(angle - Math.PI / 2) };
  }

  const angles = sectors.map((_, i) => (i / n) * 2 * Math.PI);
  const maxPct = Math.max(...sectors.map(s => s.pct), equalWeight * 2.2, 1);
  const toR = pct => (pct / maxPct) * maxR;

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
function SectorRotationWheel({ holdings, stats }) {
  const sectorMap = useMemo(() => {
    const map = {};
    holdings.forEach(h => {
      const sec = h.sector || 'Other';
      if (!map[sec]) map[sec] = { val: 0, invested: 0, mfVal: 0, stVal: 0, mfInvested: 0, stInvested: 0 };
      map[sec].val      += h.marketValue;
      map[sec].invested += h.invested;
      if (h.assetType === 'MF') { map[sec].mfVal += h.marketValue; map[sec].mfInvested += h.invested; }
      else                      { map[sec].stVal += h.marketValue; map[sec].stInvested += h.invested; }
    });
    return map;
  }, [holdings]);

  const totalVal    = stats.totalValue || 1;
  const sectorCount = Object.keys(sectorMap).length;
  const equalWeight = sectorCount > 0 ? 100 / sectorCount : 0;

  const sectors = useMemo(() =>
    Object.entries(sectorMap)
      .map(([label, d]) => ({ label, ...d, pct: (d.val / totalVal) * 100, delta: (d.val / totalVal) * 100 - equalWeight }))
      .sort((a, b) => b.pct - a.pct),
  [sectorMap, totalVal, equalWeight]);

  const overweightSectors  = sectors.filter(s => s.delta >  2);
  const underweightSectors = sectors.filter(s => s.delta < -2);
  const largestSector      = sectors[0];
  const maxVal             = sectors[0]?.val || 1;

  if (!holdings.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Sector Rotation Wheel</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Combined MF implied + direct stock sector exposure · overweight / neutral / underweight vs equal-weight benchmark
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
        {[
          { label: 'SECTORS TRACKED',    value: sectorCount,                               sub: 'Active in your portfolio',                                            color: 'var(--text)' },
          { label: 'LARGEST EXPOSURE',   value: largestSector?.label?.slice(0,10)||'—',    sub: `${fmt(largestSector?.pct||0,1)}% of portfolio`,                       color: sectorColor(largestSector?.label) },
          { label: 'OVERWEIGHT SECTORS', value: overweightSectors.length,                  sub: overweightSectors.slice(0,3).map(s=>s.label.slice(0,6)).join(', ')||'—', color: '#ef4444' },
          { label: 'UNDERWEIGHT',        value: underweightSectors.length,                 sub: underweightSectors.slice(0,3).map(s=>s.label.slice(0,6)).join(', ')||'—', color: '#8b5cf6' },
          { label: 'EQUAL WEIGHT REF',   value: `${fmt(equalWeight,1)}%`,                  sub: 'Per sector, if equally split',                                        color: 'var(--accent2)' },
          { label: 'MF IMPLIED',         value: fmtCr(stats.mfValue),                      sub: 'Capital in funds',                                                    color: 'var(--teal)' },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--font-mono)', color: m.color, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="glass" style={{ padding: '18px', display: 'flex', justifyContent: 'center' }}>
          <SectorDonut sectors={sectors} totalVal={totalVal} />
        </div>
        <div className="glass" style={{ padding: '18px', display: 'flex', justifyContent: 'center' }}>
          <RadarChart sectors={sectors} equalWeight={equalWeight} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: 'OVERWEIGHT',  color: '#ef4444', desc: 'delta > +5%' },
          { label: 'SLIGHT OW',   color: '#f59e0b', desc: '+2 to +5%'  },
          { label: 'NEUTRAL',     color: '#10b981', desc: '±2%'        },
          { label: 'SLIGHT UW',   color: '#60a5fa', desc: '-2 to -5%'  },
          { label: 'UNDERWEIGHT', color: '#8b5cf6', desc: 'delta < -5%'},
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: s.color, fontWeight: 700 }}>{s.label}</span>
            <span style={{ fontSize: 9, color: 'var(--text3)' }}>{s.desc}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)' }}>
        Pro-Sector Breakdown with Rotation Signals
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        {sectors.map((s, i) => {
          const cls  = classifyDelta(s.delta);
          const icon = SECTOR_ICONS[s.label] || '◦';
          return (
            <div key={i} style={{ borderBottom: i < sectors.length - 1 ? '1px solid rgba(45,64,96,0.35)' : 'none', padding: '10px 16px', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: sectorColor(s.label) }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: sectorColor(s.label) }}>{fmt(s.pct, 1)}%</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>{fmtCr(s.val)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: cls.bg, color: cls.color, border: `1px solid ${cls.border}`, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                    {s.delta > 0 ? '+' : ''}{fmt(s.delta, 1)}% {cls.label}
                  </span>
                </div>
              </div>
              {s.mfVal > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: 'var(--teal)' }}>MF Invested: {fmtCr(s.mfInvested)}</span>
                    <span style={{ fontSize: 9, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{fmtCr(s.mfVal)} value</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (s.mfVal / maxVal) * 100)}%`, background: 'linear-gradient(90deg, #14b8a6, #3b82f6)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              )}
              {s.stVal > 0 && (
                <div style={{ marginBottom: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: '#c084fc' }}>Stock Invested: {fmtCr(s.stInvested)}</span>
                    <span style={{ fontSize: 9, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>{fmtCr(s.stVal)} value</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (s.stVal / maxVal) * 100)}%`, background: 'linear-gradient(90deg, #8b5cf6, #c084fc)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                {s.mfVal > 0 && <span style={{ fontSize: 9, color: '#14b8a6', background: 'rgba(20,184,166,0.1)', padding: '1px 7px', borderRadius: 3, border: '1px solid rgba(20,184,166,0.25)' }}>MF {fmt((s.mfVal/s.val)*100,0)}% · {fmtCr(s.mfVal)}</span>}
                {s.stVal > 0 && <span style={{ fontSize: 9, color: '#c084fc', background: 'rgba(139,92,246,0.1)', padding: '1px 7px', borderRadius: 3, border: '1px solid rgba(139,92,246,0.25)' }}>Stocks {fmt((s.stVal/s.val)*100,0)}% · {fmtCr(s.stVal)}</span>}
                <span style={{ fontSize: 9, color: 'var(--text3)' }}>EW benchmark: {fmt(equalWeight, 1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Analytics View ───────────────────────────────────────────────────────
export default function AnalyticsView() {
  const { stats, holdings, stHoldings, mfHoldings, taxData, monthlyFlow, realizedSummary, portfolioXIRR } = usePortfolio();
  const [analyticsTab, setAnalyticsTab] = useState('overview');

  const ltcg         = holdings.filter(h => h.years >= 1);
  const stcg         = holdings.filter(h => h.years <  1);
  const ltcgInvested = ltcg.reduce((s, h) => s + h.invested, 0);
  const stcgInvested = stcg.reduce((s, h) => s + h.invested, 0);

  // Use hex colors — Chart.js cannot resolve CSS variables
  const flowBars = monthlyFlow.slice(-12).map(d => ({
    label: d.month.slice(5),
    value: d.amount,
    color: '#3b82f6',
  }));

  const sharpe   = ((stats.overallCagr - 6.5) / 14).toFixed(2);

  // Use real unrealized tax from taxData for open positions
  const unrealizedTax = taxData.reduce((s, h) => s + (h.tax || 0), 0);

  return (
    <div className="fade-up">

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        {[
          ['overview', '📊 Overview'],
          ['realized', `💰 Realized P&L${realizedSummary.sells.length > 0 ? ` (${realizedSummary.sells.length})` : ''}`],
          ['sectors',  '🎯 Sectors'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setAnalyticsTab(k)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 16px', fontSize: 13, fontWeight: 600, marginBottom: -1,
            color: analyticsTab === k ? 'var(--accent2)' : 'var(--text3)',
            borderBottom: `2px solid ${analyticsTab === k ? 'var(--accent2)' : 'transparent'}`,
          }}>{l}</button>
        ))}
      </div>

      {analyticsTab === 'overview' && (
        <>
          {/* XIRR / returns */}
          <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Return Metrics</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>Unrealized + realized — combined picture</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Portfolio XIRR',    value: portfolioXIRR != null ? fmtPct(portfolioXIRR, true) : '—', color: 'var(--green2)',  note: 'True money-weighted' },
                { label: 'Approx CAGR',       value: fmtPct(stats.overallCagr * 0.93),                          color: 'var(--accent2)', note: 'Time-weighted est.' },
                { label: 'Sharpe Ratio',      value: sharpe,                                                     color: 'var(--teal)',    note: 'Risk-adjusted' },
                { label: 'Unrealized Return', value: fmtPct(stats.totalReturnPct),                               color: colorPnl(stats.totalReturnPct), note: 'Open positions' },
                { label: 'Total Realized',    value: fmtCr(realizedSummary.totalRealized),                       color: colorPnl(realizedSummary.totalRealized), note: 'Closed positions' },
                { label: 'MF CAGR',           value: fmtPct(stats.mfCagr),                                      color: 'var(--purple)',  note: 'Weighted avg' },
              ].map((m, i) => (
                <div key={i} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)', marginTop: '2px' }}>{m.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{m.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Benchmark + Unrealized Tax */}
          <div className="grid-2" style={{ gap: '14px', marginBottom: '16px' }}>
            <div className="glass" style={{ padding: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Benchmark Comparison</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>⚠ Benchmark figures as of Jan 2025 — may diverge</div>
              <table>
                <thead>
                  <tr><th>Benchmark</th><th>5Y CAGR</th><th>3Y CAGR</th><th>1Y Return</th></tr>
                </thead>
                <tbody>
                  {BENCHMARKS.map((b, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: '600' }}>{b.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr5y}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr3y}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{b.cagr1y}%</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(59,130,246,0.08)' }}>
                    <td style={{ fontWeight: '700', color: 'var(--accent2)' }}>Your Portfolio</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green2)', fontWeight: '700' }}>{fmt(stats.overallCagr, 1)}%</td>
                    <td colSpan="2" style={{ color: 'var(--text3)', fontSize: '12px' }}>Estimated</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="glass" style={{ padding: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Unrealized Tax Exposure</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
                Tax if you sold all open positions today · LTCG 12.5% (&gt;1yr, &gt;₹1.25L) · STCG 20% (&lt;1yr)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>LTCG Holdings</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>{ltcg.length}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{fmtCr(ltcgInvested)} invested</div>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>STCG Holdings</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{stcg.length}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{fmtCr(stcgInvested)} invested</div>
                </div>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(239,68,68,0.2)', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>If Sold Today (Unrealized Tax)</div>
                <div style={{ fontSize: '20px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--red2)' }}>{fmtCr(unrealizedTax)}</div>
              </div>
              {realizedSummary.totalTax > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '8px', padding: '10px 12px', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '2px' }}>Already Realized Tax</div>
                  <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{fmtCr(realizedSummary.totalTax)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Monthly flow + holding distribution */}
          <div className="grid-2" style={{ gap: '14px' }}>
            <div className="glass" style={{ padding: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Monthly Investment Flow</div>
              {flowBars.length > 0
                ? <BarChart data={flowBars} height={120} />
                : <div style={{ color: 'var(--text3)', fontSize: '12px' }}>No data</div>
              }
            </div>
            <div className="glass" style={{ padding: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Holding Period Distribution</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <HBar label={`LTCG — >1 yr (12.5% tax) · ${ltcg.length} assets`} value={ltcgInvested} max={stats.totalInvested} color="#34d399" sub={fmtCr(ltcgInvested)} />
                <HBar label={`STCG — <1 yr (20% tax) · ${stcg.length} assets`}  value={stcgInvested} max={stats.totalInvested} color="#f59e0b" sub={fmtCr(stcgInvested)} />
              </div>
              <div className="divider" />
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                LTCG exemption: gains below ₹1.25L/year are tax-free. Book profits strategically before year-end.
              </div>
            </div>
          </div>
        </>
      )}

      {analyticsTab === 'realized' && (
        <div className="glass" style={{ padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>
            Realized P&amp;L — FIFO Accounting
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '16px' }}>
            Gains computed using First-In-First-Out lot matching. LTCG/STCG classified per lot holding period.
          </div>
          <RealizedPanel realizedSummary={realizedSummary} portfolioXIRR={portfolioXIRR} />
        </div>
      )}

      {analyticsTab === 'sectors' && (
        <div className="glass" style={{ padding: '18px' }}>
          <SectorRotationWheel holdings={holdings} stats={stats} />
        </div>
      )}
    </div>
  );
}
