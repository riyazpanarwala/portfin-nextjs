'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { getNiftyForMonth, rebaseToIndex } from '@/lib/niftyData';
import { fmtCr, fmt, fmtPct, colorPnl } from '@/lib/store';
import { ComparisonChart, AbsoluteChart } from '@/components/charts/Charts';
import { StatCard, EmptyState } from '@/components/ui/SharedUI';

// ── Rolling return comparison ─────────────────────────────────────────────────
function RollingReturns({ portfolioSeries, niftySeries }) {
  const periods = [{ label: '6M', months: 6 }, { label: '1Y', months: 12 }, { label: '2Y', months: 24 }, { label: '3Y', months: 36 }];
  const pMap = Object.fromEntries(portfolioSeries.map(d => [d.month, d.value]));
  const nMap = Object.fromEntries(niftySeries.map(d => [d.month, d.value]));
  const allMonths = portfolioSeries.map(d => d.month).sort();
  const lastMonth = allMonths[allMonths.length - 1];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
      {periods.map(({ label, months }) => {
        const fromIdx = allMonths.length - 1 - months;
        if (fromIdx < 0) return (
          <div key={label} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text3)' }}>{label}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Insufficient data</div>
          </div>
        );
        const fromMonth = allMonths[fromIdx];
        const pStart = pMap[fromMonth], pEnd = pMap[lastMonth];
        const nStart = nMap[fromMonth], nEnd = nMap[lastMonth];
        const pRet = pStart > 0 ? ((pEnd / pStart) - 1) * 100 : null;
        const nRet = nStart > 0 ? ((nEnd / nStart) - 1) * 100 : null;
        const alpha = pRet != null && nRet != null ? pRet - nRet : null;
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
  const baseP = portfolioSeries[0]?.value || 1;
  const baseN = niftySeries[0]?.value || 1;
  const baseAmt = totalInvested || 100000;
  const milestones = portfolioSeries.filter((_, i) => i === 0 || i % 6 === 0 || i === portfolioSeries.length - 1);
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
            const niftyD = niftySeries.find(n => n.month === d.month) || niftySeries[niftySeries.length - 1];
            const portVal = baseAmt * (d.value / baseP);
            const niftyVal = baseAmt * (niftyD.value / baseN);
            const alpha = portVal - niftyVal;
            return (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{d.month}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)', fontWeight: '600' }}>{(d.value / baseP * 100).toFixed(1)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)', fontWeight: '600' }}>{(niftyD.value / baseN * 100).toFixed(1)}</td>
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
  const { portfolioId, stats, setActiveView } = usePortfolio();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('indexed');

  useEffect(() => {
    if (!portfolioId) return;
    setLoading(true);
    fetch(`/api/snapshots?portfolioId=${portfolioId}&limit=100`)
      .then(r => r.json())
      .then(d => setSnapshots((d.snapshots || []).sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt))))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [portfolioId]);

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

  const niftySeries = useMemo(() =>
    portfolioSeries.map(d => ({ month: d.month, value: getNiftyForMonth(d.month) || 0 })).filter(d => d.value > 0),
    [portfolioSeries]);

  const rebasedPortfolio = useMemo(() => {
    if (!portfolioSeries.length) return [];
    return rebaseToIndex(portfolioSeries, portfolioSeries[0].value);
  }, [portfolioSeries]);

  const rebasedNifty = useMemo(() => {
    if (!niftySeries.length) return [];
    return rebaseToIndex(niftySeries, niftySeries[0].value);
  }, [niftySeries]);

  const lastP = rebasedPortfolio[rebasedPortfolio.length - 1];
  const lastN = rebasedNifty[rebasedNifty.length - 1];
  const alpha = lastP && lastN ? lastP.indexed - lastN.indexed : null;
  const pTotal = lastP ? ((lastP.indexed / 100) - 1) * 100 : 0;
  const nTotal = lastN ? ((lastN.indexed / 100) - 1) * 100 : 0;
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
      <EmptyState
        icon="📈"
        label="Not enough snapshot data yet"
        sub="You need at least 2 saved snapshots to draw a comparison chart."
        cta="Go to Snapshots"
        onCta={() => setActiveView('snapshots')}
        extra={
          <div style={{
            background: 'rgba(59,130,246,0.08)', borderRadius: '10px', padding: '14px 20px',
            border: '1px solid rgba(59,130,246,0.2)', maxWidth: '380px',
            fontSize: '12px', color: 'var(--text2)', textAlign: 'left', lineHeight: '1.8',
          }}>
            <div style={{ fontWeight: '700', color: 'var(--accent2)', marginBottom: '6px' }}>💡 Pro tip</div>
            {snapshots.length === 1
              ? '✅ You have 1 snapshot — save one more to unlock this chart.'
              : '📸 Go to Snapshot History and click "Save Snapshot Now" a few times over different days.'}
            <br />Save a snapshot weekly or monthly to build a rich comparison history.
          </div>
        }
      />
    </div>
  );

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Header stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
        <StatCard
          label="Portfolio Return"
          value={`${pTotal >= 0 ? '+' : ''}${fmt(pTotal, 1)}%`}
          color={colorPnl(pTotal)}
          sub={`Since ${firstSnapshotDate}`}
        />
        <StatCard
          label="Nifty 50 Return"
          value={`${nTotal >= 0 ? '+' : ''}${fmt(nTotal, 1)}%`}
          color={colorPnl(nTotal)}
          sub="Same period"
        />
        <StatCard
          label="Alpha Generated"
          value={alpha != null ? `${alpha >= 0 ? '+' : ''}${fmt(alpha, 1)} pts` : '—'}
          color={alpha != null ? colorPnl(alpha) : 'var(--text2)'}
          sub={alpha != null && alpha > 0 ? '🏆 Beating index' : '📉 Trailing index'}
        />
        <StatCard
          label="Portfolio CAGR"
          value={fmtPct(stats.overallCagr, true)}
          color="var(--green2)"
          sub="Annualised"
        />
        <StatCard
          label="Data Points"
          value={snapshots.length}
          color="var(--accent2)"
          sub={`${firstSnapshotDate} → ${latestSnapshotDate}`}
        />
      </div>

      {/* Alpha badge */}
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
                padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                background: mode === v ? 'rgba(59,130,246,0.2)' : 'transparent',
                border: `1px solid ${mode === v ? 'var(--accent)' : 'var(--border)'}`,
                color: mode === v ? 'var(--accent2)' : 'var(--text3)',
              }}>{l}</button>
            ))}
          </div>
        </div>
        {mode === 'indexed'
          ? <ComparisonChart portfolioSeries={rebasedPortfolio} niftySeries={rebasedNifty} />
          : <AbsoluteChart portfolioSeries={portfolioSeries} />
        }
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
        <HypotheticalTable portfolioSeries={portfolioSeries} niftySeries={niftySeries} totalInvested={stats.totalInvested} />
      </div>

      {/* Methodology note */}
      <div style={{
        padding: '12px 16px', borderRadius: '8px', fontSize: '11px', color: 'var(--text3)',
        background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', lineHeight: '1.7',
      }}>
        <strong style={{ color: 'var(--text2)' }}>Methodology:</strong> Portfolio values are from your saved snapshots.
        Nifty 50 data uses approximate end-of-month closes. Both series are rebased to 100 at your first snapshot date for fair comparison.
        Alpha = Portfolio indexed value − Nifty indexed value (index points).
        Save more snapshots regularly for better granularity.
      </div>
    </div>
  );
}
