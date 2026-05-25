'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { useSnapshots } from '@/hooks/useSnapshots';
import {
  BENCHMARKS,
  fetchBenchmarkHistory,
  getBenchmarkForMonth,
  rebaseToIndex,
  isBenchmarkDataStale,
  benchmarkDataLastMonth,
  getFDSeries,
  resolveBenchmarkColor,
} from '@/lib/niftyData';
import { fmtCr, fmt, fmtPct, colorPnl } from '@/lib/store';
import {
  ComparisonChart,
  AbsoluteChart,
  CagrTrendChart,
  DrawdownChart,
} from '@/components/charts/Charts';
import { StatCard, EmptyState } from '@/components/ui/SharedUI';
import styles from './PortfolioVsNiftyView.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// BenchmarkSelector
// ─────────────────────────────────────────────────────────────────────────────

const BENCH_KEYS = Object.keys(BENCHMARKS);

function BenchmarkSelector({ active, onChange, benchHistories, pendingKeys }) {
  return (
    <div className={styles.selectorRow}>
      <span className={styles.selectorLabel}>Compare vs</span>
      {BENCH_KEYS.map(key => {
        const bench   = BENCHMARKS[key];
        const on      = active.includes(key);
        const info    = benchHistories[key];
        const pending = pendingKeys.has(key);
        const pts     = info?.dataPoints ?? null;

        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={
              key === 'fd'
                ? 'Synthetic FD at 7.1% p.a. — no live fetch needed'
                : pts != null
                ? `${pts} monthly data points available`
                : pending
                ? 'Fetching data…'
                : 'No live data yet — uses static fallback'
            }
            style={{
              padding:      '4px 11px',
              borderRadius: 20,
              fontSize:     11,
              fontWeight:   600,
              cursor:       'pointer',
              fontFamily:   'var(--font-main)',
              border:       `1px solid ${on ? bench.color : 'var(--border)'}`,
              background:   on ? `color-mix(in srgb, ${bench.color} 14%, transparent)` : 'transparent',
              color:        on ? bench.color : 'var(--text3)',
              transition:   'all 0.15s',
              display:      'flex',
              alignItems:   'center',
              gap:          6,
            }}
          >
            <span
              className={styles.selectorSwatch}
              style={{ background: bench.color, opacity: on ? 1 : 0.35 }}
            />
            {bench.label}
            {on && key !== 'fd' && (
              <span style={{
                fontSize:   9,
                fontWeight: 700,
                padding:    '1px 5px',
                borderRadius: 4,
                background: pending
                  ? 'rgba(245,158,11,0.15)'
                  : pts != null
                  ? `color-mix(in srgb, ${bench.color} 20%, transparent)`
                  : 'rgba(148,169,196,0.12)',
                color: pending ? 'var(--yellow)' : pts != null ? bench.color : 'var(--text3)',
                border: `1px solid ${pending ? 'rgba(245,158,11,0.3)' : pts != null ? `color-mix(in srgb, ${bench.color} 35%, transparent)` : 'var(--border)'}`,
              }}>
                {pending ? '…' : pts != null ? `${pts}pts` : 'fallback'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Export
// ─────────────────────────────────────────────────────────────────────────────

function exportComparisonCSV(rebasedPortfolio, rebasedBenchSeries, activeBenchSeries) {
  const benchMaps = rebasedBenchSeries.map(b =>
    Object.fromEntries(b.data.map(d => [d.month, d.indexed]))
  );
  const headers = [
    'Month',
    'Portfolio (indexed)',
    ...activeBenchSeries.map(b => `${b.label} (indexed)`),
  ];
  const rows = rebasedPortfolio.map(d => [
    d.month,
    d.indexed?.toFixed(2) ?? '',
    ...rebasedBenchSeries.map((b, i) => {
      const val = benchMaps[i][d.month];
      return val != null ? val.toFixed(2) : '';
    }),
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = 'portfolio_vs_benchmarks.csv';
  a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// RollingReturns — uses raw portfolio values and raw benchmark values
// ─────────────────────────────────────────────────────────────────────────────

function RollingReturns({ portfolioSeries, activeBenchSeries, benchLoading }) {
  const periods = [
    { label: '6M',  months: 6  },
    { label: '1Y',  months: 12 },
    { label: '2Y',  months: 24 },
    { label: '3Y',  months: 36 },
  ];

  const pMap      = useMemo(() => Object.fromEntries(portfolioSeries.map(d => [d.month, d.value])), [portfolioSeries]);
  const allMonths = useMemo(() => portfolioSeries.map(d => d.month).sort(), [portfolioSeries]);
  const lastMonth = allMonths[allMonths.length - 1];

  return (
    <div className={styles.rollingGrid}>
      {periods.map(({ label, months }) => {
        const fromIdx = allMonths.length - 1 - months;

        if (fromIdx < 0) return (
          <div key={label} className={styles.rollingCardInsufficient}>
            <div className={styles.rollingCardPeriodLabel}>{label}</div>
            <div className={styles.rollingCardInsufficientSub}>Insufficient data</div>
          </div>
        );

        const fromMonth = allMonths[fromIdx];
        const pStart    = pMap[fromMonth];
        const pEnd      = pMap[lastMonth];
        // Straightforward % change: (end/start - 1) * 100
        const pRet = (pStart != null && pEnd != null && pStart > 0)
          ? ((pEnd / pStart) - 1) * 100 : null;

        return (
          <div
            key={label}
            className={styles.rollingCard}
            style={{ border: `1px solid ${benchLoading ? 'var(--border)' : 'rgba(59,130,246,0.15)'}` }}
          >
            <div className={styles.rollingCardHeader}>{label} RETURN</div>

            <div className={styles.rollingRow}>
              <span className={styles.rollingPortfolioLabel}>● Portfolio</span>
              <span className={styles.rollingValue} style={{ color: colorPnl(pRet) }}>
                {pRet != null ? `${pRet > 0 ? '+' : ''}${fmt(pRet, 1)}%` : '—'}
              </span>
            </div>

            {benchLoading ? (
              <div className={styles.rollingLoadingHint}>Loading benchmark data…</div>
            ) : (
              activeBenchSeries.map(b => {
                const bMap   = Object.fromEntries(b.data.map(d => [d.month, d.value]));
                const bStart = bMap[fromMonth];
                const bEnd   = bMap[lastMonth];
                const bRet   = (bStart != null && bEnd != null && bStart > 0)
                  ? ((bEnd / bStart) - 1) * 100 : null;
                const alpha  = pRet != null && bRet != null ? pRet - bRet : null;

                return (
                  <div key={b.key}>
                    <div className={styles.rollingRow}>
                      <span className={styles.rollingBenchLabel} style={{ color: b.color }}>
                        ● {b.label}
                      </span>
                      <span className={styles.rollingValue} style={{ color: colorPnl(bRet) }}>
                        {bRet != null ? `${bRet > 0 ? '+' : ''}${fmt(bRet, 1)}%` : '—'}
                      </span>
                    </div>
                    {alpha != null && (
                      <div className={`${styles.alphaChip} ${alpha > 0 ? styles.alphaChipWin : styles.alphaChipLoss}`}>
                        <span
                          className={styles.alphaChipText}
                          style={{ color: alpha > 0 ? 'var(--green2)' : 'var(--red2)' }}
                        >
                          {alpha > 0 ? '▲' : '▼'} vs {b.shortLabel ?? b.label}: {alpha > 0 ? '+' : ''}{fmt(alpha, 1)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CalendarYearReturns
//
// KEY FIX for 2017 "729%" bug:
// The first snapshot year is inherently unreliable because:
//   - We don't know the portfolio value at Jan 1 of that year
//   - Most of the "gain" from first snapshot to year-end is new money added
// Solution: for the first snapshot year, do NOT compute a return %.
// Mark it as "partial/first" and show "—" for return.
// ─────────────────────────────────────────────────────────────────────────────

function computeCalendarYearReturns(portfolioSeries, activeBenchSeries) {
  if (!portfolioSeries.length) return [];

  const pMap = Object.fromEntries(portfolioSeries.map(d => [d.month, d.value]));
  const years = [...new Set(portfolioSeries.map(d => d.month.slice(0, 4)))].sort();
  const benchMaps = activeBenchSeries.map(b =>
    Object.fromEntries(b.data.map(d => [d.month, d.value]))
  );

  function lastValueInYear(map, year) {
    for (let m = 12; m >= 1; m--) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      if (map[key] != null) return { value: map[key], month: key };
    }
    return null;
  }

  const currentYearStr = new Date().toISOString().slice(0, 4);
  const firstSnapshotYear = years[0];

  return years.map((year, idx) => {
    const isCurrentYear     = year === currentYearStr;
    const isFirstYear       = year === firstSnapshotYear;

    // Start value = last snapshot of the PREVIOUS year
    // If no previous year has snapshots → we cannot compute a valid return
    const prevYear = String(parseInt(year) - 1);
    const prevYearEnd = lastValueInYear(pMap, prevYear);
    const pStart = prevYearEnd?.value ?? null;

    const pEnd = lastValueInYear(pMap, year);
    const isPartial = isCurrentYear || pEnd?.month?.slice(5) !== '12';

    // Only compute return if we have a clean Dec-end of previous year as baseline
    // For the first snapshot year, pStart will be null → return shown as '—'
    const pRet = (pStart != null && pStart > 0 && pEnd?.value != null)
      ? ((pEnd.value / pStart) - 1) * 100
      : null;

    const benchReturns = activeBenchSeries.map((b, bi) => {
      const map = benchMaps[bi];
      const bPrevEnd = lastValueInYear(map, prevYear);
      const bStart = bPrevEnd?.value ?? null;
      const bEnd = lastValueInYear(map, year);
      const bRet = (bStart != null && bStart > 0 && bEnd?.value != null)
        ? ((bEnd.value / bStart) - 1) * 100
        : null;
      const alpha = pRet != null && bRet != null ? pRet - bRet : null;
      return { key: b.key, label: b.label, color: b.color, ret: bRet, alpha };
    });

    return { year, pRet, benchReturns, isPartial, isFirstYear };
  });
}

function CalendarYearReturns({ portfolioSeries, activeBenchSeries, benchLoading }) {
  const rows = useMemo(
    () => computeCalendarYearReturns(portfolioSeries, activeBenchSeries),
    [portfolioSeries, activeBenchSeries],
  );

  if (!rows.length) return null;

  // Exclude first year AND partial years from summary stats
  const completedRows = rows.filter(r => !r.isPartial && !r.isFirstYear && r.pRet != null);
  const bestRow  = completedRows.length ? completedRows.reduce((a, b) => (b.pRet > a.pRet ? b : a)) : null;
  const worstRow = completedRows.length ? completedRows.reduce((a, b) => (b.pRet < a.pRet ? b : a)) : null;
  const winsCount = completedRows.filter(r => r.benchReturns[0]?.alpha != null && r.benchReturns[0].alpha > 0).length;
  const lossCount = completedRows.filter(r => r.benchReturns[0]?.alpha != null && r.benchReturns[0].alpha <= 0).length;
  const hasBench  = activeBenchSeries.length > 0;

  return (
    <div>
      {completedRows.length > 0 && (
        <div className={styles.calSummaryRow}>
          {bestRow && (
            <div className={styles.calSummaryChip} style={{ borderColor: 'rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.07)' }}>
              <div className={styles.calSummaryChipLabel}>Best year</div>
              <div className={styles.calSummaryChipValue} style={{ color: 'var(--green2)' }}>
                {bestRow.year} · {bestRow.pRet > 0 ? '+' : ''}{fmt(bestRow.pRet, 1)}%
              </div>
            </div>
          )}
          {worstRow && (
            <div className={styles.calSummaryChip} style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.07)' }}>
              <div className={styles.calSummaryChipLabel}>Worst year</div>
              <div className={styles.calSummaryChipValue} style={{ color: 'var(--red2)' }}>
                {worstRow.year} · {worstRow.pRet > 0 ? '+' : ''}{fmt(worstRow.pRet, 1)}%
              </div>
            </div>
          )}
          {hasBench && completedRows.length > 0 && (
            <div className={styles.calSummaryChip} style={{ borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.06)' }}>
              <div className={styles.calSummaryChipLabel}>Beat {activeBenchSeries[0]?.label}</div>
              <div className={styles.calSummaryChipValue} style={{ color: winsCount >= lossCount ? 'var(--green2)' : 'var(--red2)' }}>
                {winsCount}W / {lossCount}L
                <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                  ({completedRows.length} full years)
                </span>
              </div>
            </div>
          )}
          {completedRows.length > 0 && (() => {
            const avg = completedRows.reduce((s, r) => s + r.pRet, 0) / completedRows.length;
            return (
              <div className={styles.calSummaryChip} style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.06)' }}>
                <div className={styles.calSummaryChipLabel}>Avg annual return</div>
                <div className={styles.calSummaryChipValue} style={{ color: 'var(--purple)' }}>
                  {avg > 0 ? '+' : ''}{fmt(avg, 1)}%
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>arithmetic</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className={styles.calTableWrapper}>
        <table>
          <thead>
            <tr>
              <th className={styles.calTh}>Year</th>
              <th className={styles.calThRight}>Portfolio</th>
              {activeBenchSeries.map(b => (
                <th key={b.key} className={styles.calThRight} style={{ color: b.color }}>{b.label}</th>
              ))}
              {hasBench && activeBenchSeries.map(b => (
                <th key={`alpha-${b.key}`} className={styles.calThRight}>
                  Alpha vs {b.label.split(' ').slice(0, 2).join(' ')}
                </th>
              ))}
              <th className={styles.calTh}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map(({ year, pRet, benchReturns, isPartial, isFirstYear }) => {
              const pColor  = pRet == null ? 'var(--text3)' : colorPnl(pRet);
              const showPartialBadge = isPartial || isFirstYear;
              return (
                <tr key={year} className={showPartialBadge ? styles.calRowPartial : styles.calRow}>
                  <td className={styles.calTdYear}>
                    <span className={styles.calYearText}>{year}</span>
                    {isCurrentYear(year) && (
                      <span className={styles.calPartialBadge}>YTD</span>
                    )}
                    {isFirstYear && !isCurrentYear(year) && (
                      <span className={styles.calPartialBadge}>first</span>
                    )}
                    {isPartial && !isFirstYear && !isCurrentYear(year) && (
                      <span className={styles.calPartialBadge}>partial</span>
                    )}
                  </td>
                  <td className={styles.calTdValue} style={{ color: pColor }}>
                    {pRet != null ? `${pRet > 0 ? '+' : ''}${fmt(pRet, 1)}%` : '—'}
                  </td>
                  {benchLoading
                    ? activeBenchSeries.map(b => <td key={b.key} className={styles.calTdMuted}>…</td>)
                    : benchReturns.map(b => (
                      <td key={b.key} className={styles.calTdValue}
                        style={{ color: b.ret != null ? colorPnl(b.ret) : 'var(--text3)' }}>
                        {b.ret != null ? `${b.ret > 0 ? '+' : ''}${fmt(b.ret, 1)}%` : '—'}
                      </td>
                    ))
                  }
                  {hasBench && (benchLoading
                    ? activeBenchSeries.map(b => <td key={`alpha-${b.key}`} className={styles.calTdMuted}>…</td>)
                    : benchReturns.map(b => {
                      const a = b.alpha;
                      return (
                        <td key={`alpha-${b.key}`}>
                          {a != null ? (
                            <span className={`${styles.calAlphaChip} ${a > 0 ? styles.calAlphaWin : styles.calAlphaLoss}`}>
                              {a > 0 ? '▲' : '▼'} {a > 0 ? '+' : ''}{fmt(a, 1)}%
                            </span>
                          ) : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
                        </td>
                      );
                    })
                  )}
                  <td className={styles.calTdBar}>
                    {pRet != null && (
                      <div className={styles.calBarWrapper}>
                        <div className={styles.calBar} style={{
                          width: `${Math.min(100, Math.abs(pRet) * 1.5)}%`,
                          background: pRet >= 0 ? 'var(--green2)' : 'var(--red2)',
                          opacity: 0.75,
                        }} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.calFootnote}>
        Returns are Jan–Dec point-to-point using the last Dec snapshot vs last Dec snapshot of prior year.
        First year shows "—" (no prior year-end baseline). YTD uses latest available snapshot.
        Alpha = portfolio return − benchmark return for the same calendar year.
        {benchLoading && <span style={{ color: 'var(--yellow)', marginLeft: 6 }}>Benchmark data loading…</span>}
      </div>
    </div>
  );
}

// Helper used inside JSX
function isCurrentYear(year) {
  return year === new Date().toISOString().slice(0, 4);
}
function BenchmarkStatusBanner({ loading, error, benchHistories, activeBenchKeys }) {
  if (!activeBenchKeys.length) return null;
  const fetchableKeys = activeBenchKeys.filter(k => k !== 'fd');
  if (!fetchableKeys.length) return null;

  if (loading) {
    return (
      <div className={styles.bannerLoading}>
        <svg width="12" height="12" viewBox="0 0 24 24" className={styles.bannerSpinner}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(148,169,196,0.3)" strokeWidth="2.5" />
          <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="var(--accent2)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        Fetching live benchmark data from Upstox… chart uses static fallback until complete.
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.bannerError}>
        <span>⚠</span>
        <span>
          Could not fetch live benchmark data from Upstox — using static fallback values.
          Check your network and reload to retry.
        </span>
      </div>
    );
  }

  return (
    <div className={styles.bannerSuccess}>
      {fetchableKeys.map(key => {
        const info  = benchHistories[key];
        const bench = BENCHMARKS[key];
        const last  = benchmarkDataLastMonth(info?.history ?? null, key);
        const stale = isBenchmarkDataStale(info?.history ?? null, key);

        if (!info) return (
          <div key={key} className={styles.bannerRow}>
            <span style={{ color: bench.color }}>●</span>
            <span style={{ color: 'var(--yellow)' }}>
              {bench.label} — using static fallback (live fetch pending or failed)
            </span>
          </div>
        );

        return (
          <div key={key} className={styles.bannerRow}>
            <span className="live-dot" style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ color: bench.color }}>{bench.label}</strong>
              {' '}via <strong>Upstox</strong>
              {' '}— up to <strong>{last}</strong>
              {info.dataPoints != null && (
                <span style={{ color: 'var(--text3)', marginLeft: 6 }}>
                  ({info.dataPoints} months)
                </span>
              )}
              {stale        && <span className={styles.bannerStaleWarning}>⚠ fallback data may be stale</span>}
              {info.warning && <span className={styles.bannerStaleWarning}>⚠ {info.warning}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModeButton
// ─────────────────────────────────────────────────────────────────────────────

function ModeButton({ label, value, active, onClick }) {
  return (
    <button
      onClick={() => onClick(value)}
      style={{
        padding:      '4px 12px',
        borderRadius: '6px',
        fontSize:     '11px',
        fontWeight:   '600',
        cursor:       'pointer',
        background:   active ? 'rgba(59,130,246,0.2)' : 'transparent',
        border:       `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color:        active ? 'var(--accent2)' : 'var(--text3)',
      }}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main View
// ─────────────────────────────────────────────────────────────────────────────

export default function PortfolioVsNiftyView() {
  const { portfolioId, stats, setActiveView } = usePortfolio();
  const { snapshots, loading: snapshotsLoading } = useSnapshots(portfolioId);

  const [mode, setMode]                       = useState('indexed');
  const hasHadDataRef                         = useRef(false);
  const [activeBenchKeys, setActiveBenchKeys] = useState(['nifty50']);

  const [benchHistories, setBenchHistories] = useState({});
  const [pendingKeys, setPendingKeys]       = useState(new Set());
  const [benchError,  setBenchError]        = useState(false);

  const firstSnapshotDate = snapshots[0]?.snapshotAt?.slice(0, 10);
  const prevFirstDateRef  = useRef(null);

  function toggleBenchmark(key) {
    setActiveBenchKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  // ── Fetch benchmark data ──────────────────────────────────────────────────
  useEffect(() => {
    if (!firstSnapshotDate) return;

    const needFetch   = activeBenchKeys.filter(k => k !== 'fd' && !benchHistories[k]);
    const dateChanged = firstSnapshotDate !== prevFirstDateRef.current;
    prevFirstDateRef.current = firstSnapshotDate;

    const toFetch = dateChanged
      ? activeBenchKeys.filter(k => k !== 'fd')
      : needFetch;

    if (!toFetch.length) return;

    let cancelled = false;
    setBenchError(false);
    if (dateChanged) setBenchHistories({});

    setPendingKeys(prev => {
      const next = new Set(prev);
      toFetch.forEach(k => next.add(k));
      return next;
    });

    Promise.all(
      toFetch.map(key =>
        fetchBenchmarkHistory(firstSnapshotDate, key).then(result => ({ key, result }))
      )
    ).then(results => {
      if (cancelled) return;
      let anyError = false;
      const updates = {};
      results.forEach(({ key, result }) => {
        if (result) { updates[key] = result; }
        else        { anyError = true; }
      });
      setBenchHistories(prev => ({ ...prev, ...updates }));
      setPendingKeys(prev => {
        const next = new Set(prev);
        toFetch.forEach(k => next.delete(k));
        return next;
      });
      if (anyError) setBenchError(true);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSnapshotDate, activeBenchKeys.join(',')]);

  const benchLoading = pendingKeys.size > 0;

  // ── Portfolio series: raw ₹ values from snapshots ─────────────────────────
  const portfolioSeries = useMemo(() => {
    if (!snapshots.length) return [];
    return snapshots.map(s => ({
      month:     s.snapshotAt.slice(0, 7),
      value:     parseFloat(s.totalValue),
      invested:  parseFloat(s.totalInvested),
      gain:      parseFloat(s.totalGain),
      returnPct: parseFloat(s.totalReturnPct),
      mfCagr:    s.mfCagr != null ? parseFloat(s.mfCagr) : null,
      stCagr:    s.stCagr != null ? parseFloat(s.stCagr) : null,
      date:      s.snapshotAt,
    }));
  }, [snapshots]);

  useEffect(() => {
    if (portfolioSeries.length > 0 && !hasHadDataRef.current) {
      hasHadDataRef.current = true;
      setMode('indexed');
    }
  }, [portfolioSeries.length]);

  // ── Benchmark series: raw index-point values ──────────────────────────────
  // These are NOT rebased — e.g. Nifty levels like 8598, 24334, etc.
  // Rebasing to 100 is done separately for chart rendering only.
  const activeBenchSeries = useMemo(() => {
    return activeBenchKeys.map(key => {
      const bench = BENCHMARKS[key];
      let data;
      if (key === 'fd') {
        // FD synthetic series already starts at 100 and compounds from there
        data = getFDSeries(portfolioSeries).map(d => ({ month: d.month, value: d.value }));
      } else {
        const history = benchHistories[key]?.history ?? null;
        data = portfolioSeries
          .map(d => ({ month: d.month, value: getBenchmarkForMonth(d.month, history, key) ?? null }))
          .filter(d => d.value !== null);
      }
      return {
        key,
        label:      bench.label,
        shortLabel: bench.label.split(' ').slice(0, 2).join(' '),
        color:      bench.color,
        hexColor:   resolveBenchmarkColor(bench.color),
        data,
        pending:    pendingKeys.has(key),
      };
    });
  }, [activeBenchKeys, benchHistories, portfolioSeries, pendingKeys]);

  // ── Rebased series: used ONLY for chart rendering ─────────────────────────
  // rebaseToIndex sets first point = 100. Do NOT use for ₹ calculations.
  const rebasedPortfolio = useMemo(() => {
    if (!portfolioSeries.length) return [];
    return rebaseToIndex(portfolioSeries, portfolioSeries[0].value);
  }, [portfolioSeries]);

  const rebasedBenchSeries = useMemo(() => {
    return activeBenchSeries
      .filter(b => b.data.length > 0)
      .map(b => ({
        ...b,
        data: b.key === 'fd'
          ? b.data.map(d => ({ ...d, indexed: d.value }))
          : rebaseToIndex(b.data, b.data[0].value),
      }));
  }, [activeBenchSeries]);

  // ── Summary stat cards ────────────────────────────────────────────────────
  // Use raw values to compute % returns — avoids the indexed-value-as-% bug.
  const firstPortfolioValue = portfolioSeries[0]?.value || 1;
  const lastPortfolioValue  = portfolioSeries[portfolioSeries.length - 1]?.value || 1;
  // Simple point-to-point % return from first to last snapshot
  const pTotal = portfolioSeries.length >= 2
    ? ((lastPortfolioValue / firstPortfolioValue) - 1) * 100
    : 0;

  const primaryBench = activeBenchSeries[0];
  // Benchmark % return over the same period
  const bTotal = (() => {
    if (!primaryBench || !primaryBench.data.length) return 0;
    const bFirst = primaryBench.data[0]?.value || 1;
    const bLast  = primaryBench.data[primaryBench.data.length - 1]?.value || 1;
    return ((bLast / bFirst) - 1) * 100;
  })();

  const alphaReturnPct = primaryBench ? pTotal - bTotal : null;
  // Index pts difference: use rebased series so it's meaningful (both start at 100)
  const lastP         = rebasedPortfolio[rebasedPortfolio.length - 1];
  const lastPrimBench = primaryBench
    ? rebasedBenchSeries.find(b => b.key === primaryBench.key)?.data?.slice(-1)[0]
    : null;
  const alphaIndexPts = lastP && lastPrimBench
    ? lastP.indexed - lastPrimBench.indexed
    : null;

  const firstSnapshotDateFmt = snapshots[0]?.snapshotAt?.slice(0, 10);
  const latestSnapshotDate   = snapshots[snapshots.length - 1]?.snapshotAt?.slice(0, 10);

  const handleExportCSV = useCallback(() => {
    exportComparisonCSV(rebasedPortfolio, rebasedBenchSeries, activeBenchSeries);
  }, [rebasedPortfolio, rebasedBenchSeries, activeBenchSeries]);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (snapshotsLoading) return (
    <div className={`${styles.skeletonStack} fade-up`}>
      {[140, 260, 100].map((h, i) => (
        <div key={i} className={`skeleton ${styles.skeletonBlock}`} style={{ height: h }} />
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
          <div className={styles.proTipBox}>
            <div className={styles.proTipLabel}>💡 Pro tip</div>
            {snapshots.length === 1
              ? '✅ You have 1 snapshot — save one more to unlock this chart.'
              : '📸 Go to Snapshot History and click "Save Snapshot Now" a few times over different days.'}
            <br />Save a snapshot weekly or monthly to build a rich comparison history.
          </div>
        }
      />
    </div>
  );

  const alphaBg = (alphaReturnPct ?? 0) > 0
    ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(20,184,166,0.06))'
    : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.06))';
  const alphaBorderColor = (alphaReturnPct ?? 0) > 0 ? 'var(--green)' : 'var(--red)';

  const MODES = [
    ['indexed',  'Indexed'],
    ['absolute', 'Absolute'],
    ['cagr',     'CAGR'],
    ['drawdown', 'Drawdown'],
  ];

  return (
    <div className={`${styles.wrapper} fade-up`}>

      <BenchmarkStatusBanner
        loading={benchLoading}
        error={benchError}
        benchHistories={benchHistories}
        activeBenchKeys={activeBenchKeys}
      />

      <div className={`glass ${styles.selectorPanel}`}>
        <BenchmarkSelector
          active={activeBenchKeys}
          onChange={toggleBenchmark}
          benchHistories={benchHistories}
          pendingKeys={pendingKeys}
        />
      </div>

      {/* ── Stat cards ── */}
      <div className={styles.statsGrid}>
        <StatCard
          label="Portfolio return"
          value={`${pTotal >= 0 ? '+' : ''}${fmt(pTotal, 1)}%`}
          color={colorPnl(pTotal)}
          sub={`Since ${firstSnapshotDateFmt}`}
        />
        {primaryBench && (
          <StatCard
            label={`${primaryBench.label} return`}
            value={`${bTotal >= 0 ? '+' : ''}${fmt(bTotal, 1)}%`}
            color={primaryBench.color}
            sub="Same period"
          />
        )}
        <StatCard
          label="Alpha vs primary"
          value={alphaReturnPct != null ? `${alphaReturnPct >= 0 ? '+' : ''}${fmt(alphaReturnPct, 1)}%` : '—'}
          color={alphaReturnPct != null ? colorPnl(alphaReturnPct) : 'var(--text2)'}
          sub={alphaIndexPts != null
            ? `${fmt(Math.abs(alphaIndexPts), 1)} index pts`
            : primaryBench ? `vs ${primaryBench.label}` : '—'}
        />
        <StatCard
          label="Portfolio CAGR"
          value={fmtPct(stats.overallCagr, true)}
          color="var(--green2)"
          sub="Annualised"
        />
        <StatCard
          label="Data points"
          value={snapshots.length}
          color="var(--accent2)"
          sub={`${firstSnapshotDateFmt} → ${latestSnapshotDate}`}
        />
      </div>

      {alphaReturnPct != null && (
        <div
          className={styles.alphaBadge}
          style={{ background: alphaBg, border: `1px solid ${alphaBorderColor}` }}
        >
          <div>
            <span
              className={styles.alphaBadgeTitle}
              style={{ color: alphaReturnPct > 0 ? 'var(--green2)' : 'var(--red2)' }}
            >
              {alphaReturnPct > 0 ? '🏆 Your portfolio is beating' : '📉 Your portfolio is trailing'}{' '}
              {primaryBench?.label}
            </span>
            <span className={styles.alphaBadgeSub}>
              by {fmt(Math.abs(alphaReturnPct), 1)}% return
              {alphaIndexPts != null && ` (${fmt(Math.abs(alphaIndexPts), 1)} index pts)`}
            </span>
          </div>
          <div className={styles.alphaBadgeDates}>
            {firstSnapshotDateFmt} → {latestSnapshotDate}
          </div>
        </div>
      )}

      {/* ── Main chart panel ── */}
      <div className={`glass ${styles.chartPanel}`}>
        <div className={styles.chartHeader}>
          <div>
            <div className={styles.chartTitle}>
              {mode === 'cagr'     ? 'Sub-portfolio CAGR trend'     :
               mode === 'drawdown' ? 'Drawdown analysis'            :
                                     'Portfolio vs benchmarks'}
            </div>
            <div className={styles.chartSubtitle}>
              {mode === 'cagr'     ? 'MF and stock CAGR captured in each saved snapshot'                      :
               mode === 'drawdown' ? 'Peak-to-trough decline at each month — shallower is better'             :
               mode === 'absolute' ? 'Raw portfolio value and invested capital over time'                      :
                                     'Indexed to 100 at first snapshot — shows relative performance'}
              {(mode === 'indexed' || mode === 'drawdown') && benchLoading && (
                <span className={styles.chartSubtitleWarning}>
                  {' '}(benchmark lines use static data while live fetch completes)
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(mode === 'indexed') && rebasedPortfolio.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="btn btn-ghost"
                style={{ padding: '4px 10px', fontSize: 11, gap: 5 }}
                title="Export indexed comparison series as CSV"
              >
                ↓ CSV
              </button>
            )}
            <div className={styles.chartModeGroup}>
              {MODES.map(([v, l]) => (
                <ModeButton key={v} value={v} label={l} active={mode === v} onClick={setMode} />
              ))}
            </div>
          </div>
        </div>

        {mode === 'indexed' && (
          <ComparisonChart
            portfolioSeries={rebasedPortfolio}
            benchmarkSeries={rebasedBenchSeries.map(b => ({ ...b, color: b.hexColor }))}
          />
        )}
        {mode === 'absolute' && <AbsoluteChart portfolioSeries={portfolioSeries} />}
        {mode === 'cagr'     && <CagrTrendChart series={portfolioSeries} />}
        {mode === 'drawdown' && (
          <DrawdownChart
            portfolioSeries={rebasedPortfolio}
            benchmarkSeries={rebasedBenchSeries.map(b => ({ ...b, color: b.hexColor }))}
          />
        )}
      </div>

      {/* ── Rolling returns ── */}
      <div className={`glass ${styles.rollingPanel}`}>
        <div className={styles.rollingTitle}>Rolling return comparison</div>
        <div className={styles.rollingSub}>
          Point-to-point return vs selected benchmarks over different time horizons
          {benchLoading && (
            <span className={styles.rollingSubWarning}>
              · benchmark columns show live data once fetch completes
            </span>
          )}
        </div>
        <RollingReturns
          portfolioSeries={portfolioSeries}
          activeBenchSeries={activeBenchSeries}
          benchLoading={benchLoading}
        />
      </div>

      {/* ── Calendar year returns ── */}
      <div className={`glass ${styles.calPanel}`}>
        <div className={styles.calPanelHeader}>
          <div>
            <div className={styles.calPanelTitle}>Calendar year returns</div>
            <div className={styles.calPanelSub}>
              Jan–Dec performance vs selected benchmarks · First year always shows "—" (no prior year-end baseline)
            </div>
          </div>
          {benchLoading && (
            <span style={{ fontSize: 11, color: 'var(--yellow)' }}>⏳ Loading benchmark data…</span>
          )}
        </div>
        <CalendarYearReturns
          portfolioSeries={portfolioSeries}
          activeBenchSeries={activeBenchSeries}
          benchLoading={benchLoading}
        />
      </div>


      <div className={styles.methodologyNote}>
        <strong className={styles.methodologyNoteStrong}>Methodology:</strong>{' '}
        Portfolio values from saved snapshots.
        <strong className={styles.methodologyNoteStrong}> Portfolio return</strong> = (last snapshot ÷ first snapshot − 1) × 100.
        Benchmark data fetched live from Upstox V3 API (Nifty 50, Sensex, Nifty Midcap 100, Nifty Smallcap 100).
        FD/Risk-free line is synthetic at 7.1% p.a. compounded monthly.
        Indexed chart rebases all series to 100 at first snapshot for visual comparison only.
        <strong className={styles.methodologyNoteStrong}> Calendar year returns</strong> use last Dec snapshot ÷ prior Dec snapshot − 1; first year shows "—" (no baseline).
        Save snapshots regularly for better chart granularity.
      </div>
    </div>
  );
}
