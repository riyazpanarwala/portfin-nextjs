'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, fmtPct, colorPnl } from '@/lib/store';

// ── Nifty 50 historical monthly close (Jan 2020 – Apr 2026) ──────────────────
// Source: NSE India historical data (approximate monthly closes)
const NIFTY_HISTORY = {
  '2020-01': 12282, '2020-02': 11633, '2020-03': 8598,  '2020-04': 9860,
  '2020-05': 9580,  '2020-06': 10302, '2020-07': 11073, '2020-08': 11388,
  '2020-09': 11248, '2020-10': 11642, '2020-11': 12968, '2020-12': 13982,
  '2021-01': 13635, '2021-02': 14529, '2021-03': 14691, '2021-04': 14631,
  '2021-05': 15582, '2021-06': 15722, '2021-07': 15763, '2021-08': 16706,
  '2021-09': 17618, '2021-10': 17671, '2021-11': 16983, '2021-12': 17354,
  '2022-01': 17340, '2022-02': 16658, '2022-03': 17465, '2022-04': 17103,
  '2022-05': 16584, '2022-06': 15780, '2022-07': 17158, '2022-08': 17759,
  '2022-09': 17094, '2022-10': 18012, '2022-11': 18758, '2022-12': 18105,
  '2023-01': 17616, '2023-02': 17554, '2023-03': 17360, '2023-04': 18065,
  '2023-05': 18534, '2023-06': 18935, '2023-07': 19754, '2023-08': 19265,
  '2023-09': 19638, '2023-10': 19047, '2023-11': 19795, '2023-12': 21731,
  '2024-01': 21725, '2024-02': 22040, '2024-03': 22326, '2024-04': 22147,
  '2024-05': 22531, '2024-06': 23440, '2024-07': 24951, '2024-08': 25235,
  '2024-09': 25811, '2024-10': 24205, '2024-11': 23911, '2024-12': 23645,
  '2025-01': 23163, '2025-02': 22125, '2025-03': 23519, '2025-04': 24039,
  '2025-05': 24857, '2025-06': 24502, '2025-07': 25412, '2025-08': 24987,
  '2025-09': 26103, '2025-10': 25678, '2025-11': 26845, '2025-12': 27210,
  '2026-01': 27502, '2026-02': 26843, '2026-03': 27920, '2026-04': 23500,
};

// Get Nifty value for a given month, filling forward if missing
function getNiftyForMonth(month) {
  if (NIFTY_HISTORY[month]) return NIFTY_HISTORY[month];
  // Find nearest prior month
  const months = Object.keys(NIFTY_HISTORY).sort();
  const prior = months.filter(m => m <= month).pop();
  return prior ? NIFTY_HISTORY[prior] : null;
}

// ── Compute rebased series (both starting at 100) ────────────────────────────
function rebaseToIndex(series, baseValue) {
  return series.map(d => ({ ...d, indexed: baseValue > 0 ? (d.value / baseValue) * 100 : 100 }));
}

// ── Chart SVG ─────────────────────────────────────────────────────────────────
function ComparisonChart({ portfolioSeries, niftySeries, width = 700, height = 260 }) {
  if (!portfolioSeries.length || !niftySeries.length) return null;

  const pad = { top: 24, right: 60, bottom: 36, left: 52 };
  const W = width - pad.left - pad.right;
  const H = height - pad.top - pad.bottom;

  const allVals = [
    ...portfolioSeries.map(d => d.indexed),
    ...niftySeries.map(d => d.indexed),
  ];
  const minV = Math.min(...allVals) * 0.97;
  const maxV = Math.max(...allVals) * 1.03;
  const range = maxV - minV || 1;

  const allMonths = [...new Set([
    ...portfolioSeries.map(d => d.month),
    ...niftySeries.map(d => d.month),
  ])].sort();

  function toX(month) {
    const idx = allMonths.indexOf(month);
    return pad.left + (idx / Math.max(allMonths.length - 1, 1)) * W;
  }
  function toY(val) {
    return pad.top + ((maxV - val) / range) * H;
  }

  const pLine = portfolioSeries.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(d.month)} ${toY(d.indexed)}`
  ).join(' ');
  const nLine = niftySeries.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(d.month)} ${toY(d.indexed)}`
  ).join(' ');

  const pArea = pLine +
    ` L ${toX(portfolioSeries[portfolioSeries.length - 1].month)} ${pad.top + H}` +
    ` L ${toX(portfolioSeries[0].month)} ${pad.top + H} Z`;

  // Y grid lines
  const gridVals = [];
  const step = Math.ceil((maxV - minV) / 5 / 10) * 10;
  for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) {
    gridVals.push(v);
  }

  // X labels — every 6 months
  const xLabels = allMonths.filter((m, i) => i % 6 === 0 || i === allMonths.length - 1);

  const lastP = portfolioSeries[portfolioSeries.length - 1];
  const lastN = niftySeries[niftySeries.length - 1];
  const portfolioAhead = lastP && lastN && lastP.indexed > lastN.indexed;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
        <clipPath id="chartClip">
          <rect x={pad.left} y={pad.top} width={W} height={H} />
        </clipPath>
      </defs>

      {/* Grid lines */}
      {gridVals.map((v, i) => (
        <g key={i}>
          <line
            x1={pad.left} y1={toY(v)} x2={pad.left + W} y2={toY(v)}
            stroke="rgba(45,64,96,0.5)" strokeWidth="1" strokeDasharray="4,4"
          />
          <text x={pad.left - 6} y={toY(v) + 4} textAnchor="end"
            fill="var(--text3)" fontSize="9" fontFamily="var(--font-mono)">
            {v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Baseline at 100 */}
      {minV <= 100 && maxV >= 100 && (
        <line
          x1={pad.left} y1={toY(100)} x2={pad.left + W} y2={toY(100)}
          stroke="rgba(148,169,196,0.4)" strokeWidth="1.5" strokeDasharray="6,3"
        />
      )}

      {/* Portfolio area */}
      <path d={pArea} fill="url(#pGrad)" clipPath="url(#chartClip)" />

      {/* Nifty line */}
      <path d={nLine} fill="none" stroke="var(--yellow)" strokeWidth="2"
        strokeLinecap="round" strokeDasharray="6,3" clipPath="url(#chartClip)" />

      {/* Portfolio line */}
      <path d={pLine} fill="none" stroke="var(--accent)" strokeWidth="2.5"
        strokeLinecap="round" clipPath="url(#chartClip)" />

      {/* End dots */}
      {lastP && (
        <circle cx={toX(lastP.month)} cy={toY(lastP.indexed)} r="4"
          fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
      )}
      {lastN && (
        <circle cx={toX(lastN.month)} cy={toY(lastN.indexed)} r="4"
          fill="var(--yellow)" stroke="var(--bg)" strokeWidth="2" />
      )}

      {/* End value labels */}
      {lastP && (
        <text x={pad.left + W + 6} y={toY(lastP.indexed) + 4}
          fill="var(--accent2)" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700">
          {lastP.indexed.toFixed(1)}
        </text>
      )}
      {lastN && (
        <text x={pad.left + W + 6} y={toY(lastN.indexed) + 4}
          fill="var(--yellow)" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700">
          {lastN.indexed.toFixed(1)}
        </text>
      )}

      {/* X axis labels */}
      {xLabels.map((m, i) => (
        <text key={i} x={toX(m)} y={pad.top + H + 20}
          textAnchor="middle" fill="var(--text3)" fontSize="9">
          {m.slice(0, 7)}
        </text>
      ))}

      {/* Legend */}
      <rect x={pad.left} y={8} width="10" height="3" rx="1" fill="var(--accent)" />
      <text x={pad.left + 14} y={14} fill="var(--text2)" fontSize="10" fontWeight="600">Your Portfolio</text>
      <line x1={pad.left + 100} y1={10} x2={pad.left + 114} y2={10}
        stroke="var(--yellow)" strokeWidth="2" strokeDasharray="5,3" />
      <text x={pad.left + 118} y={14} fill="var(--text2)" fontSize="10" fontWeight="600">Nifty 50</text>
      <text x={pad.left + 172} y={14} fill="var(--text3)" fontSize="9">(rebased to 100)</text>
    </svg>
  );
}

// ── Rolling return comparison ─────────────────────────────────────────────────
function RollingReturns({ portfolioSeries, niftySeries }) {
  const periods = [
    { label: '6M', months: 6 },
    { label: '1Y', months: 12 },
    { label: '2Y', months: 24 },
    { label: '3Y', months: 36 },
  ];

  const pMap = Object.fromEntries(portfolioSeries.map(d => [d.month, d.value]));
  const nMap = Object.fromEntries(niftySeries.map(d => [d.month, d.value]));
  const allMonths = portfolioSeries.map(d => d.month).sort();
  const lastMonth = allMonths[allMonths.length - 1];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
      {periods.map(({ label, months }) => {
        const targetIdx = allMonths.length - 1;
        const fromIdx   = targetIdx - months;
        if (fromIdx < 0) return (
          <div key={label} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text3)' }}>{label}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Insufficient data</div>
          </div>
        );

        const fromMonth = allMonths[fromIdx];
        const pStart = pMap[fromMonth], pEnd = pMap[lastMonth];
        const nStart = nMap[fromMonth], nEnd = nMap[lastMonth];
        const pRet   = pStart > 0 ? ((pEnd / pStart) - 1) * 100 : null;
        const nRet   = nStart > 0 ? ((nEnd / nStart) - 1) * 100 : null;
        const alpha  = pRet != null && nRet != null ? pRet - nRet : null;

        return (
          <div key={label} style={{
            background: 'var(--bg3)', borderRadius: '8px', padding: '14px',
            border: `1px solid ${alpha != null && alpha > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', letterSpacing: '0.06em', marginBottom: '8px' }}>{label} RETURN</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Portfolio</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: '700', color: colorPnl(pRet) }}>
                {pRet != null ? `${pRet > 0 ? '+' : ''}${fmt(pRet, 1)}%` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Nifty 50</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: '700', color: colorPnl(nRet) }}>
                {nRet != null ? `${nRet > 0 ? '+' : ''}${fmt(nRet, 1)}%` : '—'}
              </span>
            </div>
            {alpha != null && (
              <div style={{
                padding: '4px 8px', borderRadius: '5px', textAlign: 'center',
                background: alpha > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${alpha > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: alpha > 0 ? 'var(--green2)' : 'var(--red2)' }}>
                  {alpha > 0 ? '▲' : '▼'} Alpha: {alpha > 0 ? '+' : ''}{fmt(alpha, 1)}%
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Hypothetical growth table ─────────────────────────────────────────────────
function HypotheticalTable({ portfolioSeries, niftySeries, totalInvested }) {
  if (!portfolioSeries.length) return null;

  const baseP     = portfolioSeries[0]?.value || 1;
  const baseN     = niftySeries[0]?.value || 1;
  const baseAmt   = totalInvested || 100000;

  const milestones = portfolioSeries.filter((_, i) =>
    i === 0 || i % 6 === 0 || i === portfolioSeries.length - 1
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Portfolio Index</th>
            <th>Nifty 50 Index</th>
            <th>₹{fmt(baseAmt / 100000, 1)}L in Portfolio</th>
            <th>₹{fmt(baseAmt / 100000, 1)}L in Nifty</th>
            <th>Alpha</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((d, i) => {
            const niftyD = niftySeries.find(n => n.month === d.month) || niftySeries[i] || niftySeries[niftySeries.length - 1];
            const portVal  = baseAmt * (d.value / baseP);
            const niftyVal = baseAmt * (niftyD.value / baseN);
            const alpha    = portVal - niftyVal;
            return (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{d.month}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)', fontWeight: '600' }}>
                  {(d.value / baseP * 100).toFixed(1)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)', fontWeight: '600' }}>
                  {(niftyD.value / baseN * 100).toFixed(1)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700' }}>{fmtCr(portVal)}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtCr(niftyVal)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: colorPnl(alpha) }}>
                  {alpha >= 0 ? '+' : ''}{fmtCr(alpha)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export default function PortfolioVsNiftyView() {
  const { portfolioId, stats, trades } = usePortfolio();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [mode, setMode]           = useState('indexed'); // indexed | absolute

  useEffect(() => {
    if (!portfolioId) return;
    setLoading(true);
    fetch(`/api/snapshots?portfolioId=${portfolioId}&limit=100`)
      .then(r => r.json())
      .then(d => setSnapshots((d.snapshots || []).sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt))))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [portfolioId]);

  // Portfolio series from snapshots
  const portfolioSeries = useMemo(() => {
    if (!snapshots.length) return [];
    return snapshots.map(s => ({
      month: s.snapshotAt.slice(0, 7),
      value: parseFloat(s.totalValue),
      invested: parseFloat(s.totalInvested),
      gain: parseFloat(s.totalGain),
      returnPct: parseFloat(s.totalReturnPct),
      date: s.snapshotAt,
    }));
  }, [snapshots]);

  // Nifty series aligned to portfolio months
  const niftySeries = useMemo(() => {
    if (!portfolioSeries.length) return [];
    return portfolioSeries.map(d => ({
      month: d.month,
      value: getNiftyForMonth(d.month) || 0,
    })).filter(d => d.value > 0);
  }, [portfolioSeries]);

  // Rebased series (both start at 100)
  const rebasedPortfolio = useMemo(() => {
    if (!portfolioSeries.length) return [];
    const base = portfolioSeries[0].value;
    return rebaseToIndex(portfolioSeries, base);
  }, [portfolioSeries]);

  const rebasedNifty = useMemo(() => {
    if (!niftySeries.length) return [];
    const base = niftySeries[0].value;
    return rebaseToIndex(niftySeries, base);
  }, [niftySeries]);

  // Stats
  const lastP  = rebasedPortfolio[rebasedPortfolio.length - 1];
  const lastN  = rebasedNifty[rebasedNifty.length - 1];
  const alpha  = lastP && lastN ? lastP.indexed - lastN.indexed : null;
  const pTotal = lastP ? ((lastP.indexed / 100) - 1) * 100 : 0;
  const nTotal = lastN ? ((lastN.indexed / 100) - 1) * 100 : 0;

  // Earliest snapshot for context
  const firstSnapshotDate = snapshots[0]?.snapshotAt?.slice(0, 10);
  const latestSnapshotDate = snapshots[snapshots.length - 1]?.snapshotAt?.slice(0, 10);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="fade-up">
      {[140, 260, 100].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: '12px' }} />
      ))}
    </div>
  );

  if (snapshots.length < 2) return (
    <div className="fade-up">
      <div className="glass" style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📈</div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
          Not enough snapshot data yet
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '420px', margin: '0 auto', marginBottom: '20px' }}>
          This view compares your portfolio value over time against Nifty 50.
          You need at least 2 saved snapshots to draw a comparison chart.
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '20px' }}>
          {snapshots.length === 1
            ? '✅ You have 1 snapshot — save one more to unlock this chart.'
            : '📸 Go to Snapshot History and click "Save Snapshot Now" a few times over different days.'}
        </div>
        <div style={{
          background: 'rgba(59,130,246,0.08)', borderRadius: '10px', padding: '14px 20px',
          border: '1px solid rgba(59,130,246,0.2)', maxWidth: '380px', margin: '0 auto',
          fontSize: '12px', color: 'var(--text2)', textAlign: 'left', lineHeight: '1.8',
        }}>
          <div style={{ fontWeight: '700', color: 'var(--accent2)', marginBottom: '6px' }}>💡 Pro tip</div>
          Save a snapshot weekly or monthly to build a rich comparison history.
          The more data points, the more useful the chart becomes.
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Header stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
        {[
          {
            label: 'Portfolio Return',
            value: `${pTotal >= 0 ? '+' : ''}${fmt(pTotal, 1)}%`,
            color: colorPnl(pTotal),
            sub: `Since ${firstSnapshotDate}`,
          },
          {
            label: 'Nifty 50 Return',
            value: `${nTotal >= 0 ? '+' : ''}${fmt(nTotal, 1)}%`,
            color: colorPnl(nTotal),
            sub: 'Same period',
          },
          {
            label: 'Alpha Generated',
            value: alpha != null ? `${alpha >= 0 ? '+' : ''}${fmt(alpha, 1)} pts` : '—',
            color: alpha != null ? colorPnl(alpha) : 'var(--text2)',
            sub: alpha != null && alpha > 0 ? '🏆 Beating index' : alpha != null ? '📉 Trailing index' : '—',
          },
          {
            label: 'Portfolio CAGR',
            value: fmtPct(stats.overallCagr, true),
            color: 'var(--green2)',
            sub: 'Annualised',
          },
          {
            label: 'Data Points',
            value: snapshots.length,
            color: 'var(--accent2)',
            sub: `${firstSnapshotDate} → ${latestSnapshotDate}`,
          },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Alpha / lag badge */}
      {alpha != null && (
        <div style={{
          padding: '12px 18px', borderRadius: '10px',
          background: alpha > 0
            ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(20,184,166,0.06))'
            : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.06))',
          border: `1px solid ${alpha > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: '700', color: alpha > 0 ? 'var(--green2)' : 'var(--red2)' }}>
              {alpha > 0 ? '🏆 Your portfolio is beating Nifty 50' : '📉 Your portfolio is trailing Nifty 50'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text2)', marginLeft: '10px' }}>
              by {Math.abs(alpha).toFixed(1)} index points ({alpha > 0 ? '+' : ''}{fmt(pTotal - nTotal, 1)}% absolute)
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
            Base period: {firstSnapshotDate} → {latestSnapshotDate}
          </div>
        </div>
      )}

      {/* Main chart */}
      <div className="glass" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)' }}>Portfolio vs Nifty 50</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
              Indexed to 100 at start — shows relative performance irrespective of portfolio size
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['indexed', 'Indexed'], ['absolute', 'Absolute']].map(([v, l]) => (
              <button key={v} onClick={() => setMode(v)} style={{
                padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                cursor: 'pointer', transition: 'all 0.15s',
                background: mode === v ? 'rgba(59,130,246,0.2)' : 'transparent',
                border: `1px solid ${mode === v ? 'var(--accent)' : 'var(--border)'}`,
                color: mode === v ? 'var(--accent2)' : 'var(--text3)',
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {mode === 'indexed' ? (
            <ComparisonChart portfolioSeries={rebasedPortfolio} niftySeries={rebasedNifty} />
          ) : (
            <AbsoluteChart portfolioSeries={portfolioSeries} niftySeries={niftySeries} />
          )}
        </div>
      </div>

      {/* Rolling returns */}
      <div className="glass" style={{ padding: '18px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Rolling Return Comparison</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
          Point-to-point return vs Nifty 50 over different time horizons
        </div>
        <RollingReturns portfolioSeries={portfolioSeries} niftySeries={niftySeries} />
      </div>

      {/* Hypothetical growth table */}
      <div className="glass" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
            Hypothetical Growth — ₹{fmt(stats.totalInvested / 100000, 1)}L invested
          </span>
          <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text3)' }}>
            · What would the same capital look like in Nifty 50?
          </span>
        </div>
        <HypotheticalTable
          portfolioSeries={portfolioSeries}
          niftySeries={niftySeries}
          totalInvested={stats.totalInvested}
        />
      </div>

      {/* Methodology note */}
      <div style={{
        padding: '12px 16px', borderRadius: '8px', fontSize: '11px', color: 'var(--text3)',
        background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
        lineHeight: '1.7',
      }}>
        <strong style={{ color: 'var(--text2)' }}>Methodology:</strong> Portfolio values are from your saved snapshots.
        Nifty 50 data uses approximate end-of-month closes. Both series are rebased to 100 at your first snapshot date for fair comparison.
        Alpha = Portfolio indexed value − Nifty indexed value (index points).
        Save more snapshots regularly for better granularity.
      </div>
    </div>
  );
}

// ── Absolute value chart ──────────────────────────────────────────────────────
function AbsoluteChart({ portfolioSeries, niftySeries }) {
  if (!portfolioSeries.length) return null;

  const width = 700, height = 260;
  const pad = { top: 24, right: 60, bottom: 36, left: 60 };
  const W = width - pad.left - pad.right;
  const H = height - pad.top - pad.bottom;

  const allVals = portfolioSeries.map(d => d.value);
  const maxV = Math.max(...allVals) * 1.05;
  const minV = Math.min(...allVals) * 0.95;
  const range = maxV - minV || 1;

  function toX(i, len) { return pad.left + (i / Math.max(len - 1, 1)) * W; }
  function toY(v) { return pad.top + ((maxV - v) / range) * H; }

  const line = portfolioSeries.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i, portfolioSeries.length)} ${toY(d.value)}`
  ).join(' ');
  const area = line +
    ` L ${toX(portfolioSeries.length - 1, portfolioSeries.length)} ${pad.top + H}` +
    ` L ${toX(0, portfolioSeries.length)} ${pad.top + H} Z`;

  const investedLine = portfolioSeries.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i, portfolioSeries.length)} ${toY(d.invested)}`
  ).join(' ');

  const xLabels = portfolioSeries.filter((_, i) => i % Math.max(1, Math.floor(portfolioSeries.length / 8)) === 0);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="absGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#absGrad)" />
      <path d={investedLine} fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeDasharray="5,3" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      {xLabels.map((d, i) => {
        const idx = portfolioSeries.indexOf(d);
        return (
          <text key={i} x={toX(idx, portfolioSeries.length)} y={pad.top + H + 20}
            textAnchor="middle" fill="var(--text3)" fontSize="9">{d.month}</text>
        );
      })}
      {/* Legend */}
      <rect x={pad.left} y={8} width="10" height="3" rx="1" fill="var(--accent)" />
      <text x={pad.left + 14} y={14} fill="var(--text2)" fontSize="10" fontWeight="600">Portfolio Value</text>
      <line x1={pad.left + 110} y1={10} x2={pad.left + 124} y2={10}
        stroke="var(--text3)" strokeWidth="1.5" strokeDasharray="5,3" />
      <text x={pad.left + 128} y={14} fill="var(--text2)" fontSize="10" fontWeight="600">Total Invested</text>
    </svg>
  );
}
