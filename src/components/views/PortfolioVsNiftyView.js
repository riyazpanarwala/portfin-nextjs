'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { ComparisonChart, AbsoluteChart, CagrTrendChart } from '@/components/charts/Charts';
import { StatCard, EmptyState } from '@/components/ui/SharedUI';
import styles from './PortfolioVsNiftyView.module.css';

// ─── Benchmark selector ───────────────────────────────────────────────────────

const BENCH_KEYS = Object.keys(BENCHMARKS);

function BenchmarkSelector({ active, onChange }) {
  return (
    <div className={styles.selectorRow}>
      <span className={styles.selectorLabel}>Compare vs</span>
      {BENCH_KEYS.map(key => {
        const bench = BENCHMARKS[key];
        const on    = active.includes(key);
        // bench.color is a CSS variable — used directly for dynamic border/bg/text
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
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
            }}
          >
            <span
              className={styles.selectorSwatch}
              style={{ background: bench.color, opacity: on ? 1 : 0.35 }}
            />
            {bench.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Rolling return comparison ────────────────────────────────────────────────

function RollingReturns({ portfolioSeries, activeBenchSeries, benchLoading }) {
  const periods = [
    { label: '6M',  months: 6  },
    { label: '1Y',  months: 12 },
    { label: '2Y',  months: 24 },
    { label: '3Y',  months: 36 },
  ];

  const pMap      = Object.fromEntries(portfolioSeries.map(d => [d.month, d.value]));
  const allMonths = portfolioSeries.map(d => d.month).sort();
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
        const pRet = (pStart != null && pEnd != null && pStart > 0)
          ? ((pEnd / pStart) - 1) * 100 : null;

        // border colour depends on loading state — stays inline (dynamic value)
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
                      {/* bench.color is a CSS var — inline only because it's dynamic per benchmark */}
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

// ─── Hypothetical growth table ────────────────────────────────────────────────

function HypotheticalTable({ portfolioSeries, activeBenchSeries, totalInvested, benchLoading }) {
  if (!portfolioSeries.length) return null;

  const baseP   = portfolioSeries[0]?.value || 1;
  const baseAmt = totalInvested || 100000;

  const milestones = useMemo(() => {
    if (!portfolioSeries.length) return [];
    const result = [portfolioSeries[0]];
    for (let i = 1; i < portfolioSeries.length - 1; i++) {
      const [, mm] = portfolioSeries[i].month.split('-');
      if (mm === '01' || mm === '07') result.push(portfolioSeries[i]);
    }
    result.push(portfolioSeries[portfolioSeries.length - 1]);
    return result.filter((d, i, a) => i === 0 || d.month !== a[i - 1].month);
  }, [portfolioSeries]);

  const benchMaps = activeBenchSeries.map(b =>
    Object.fromEntries(b.data.map(d => [d.month, d.value]))
  );

  return (
    <div className={styles.hypotheticalTableWrapper}>
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Portfolio index</th>
            {activeBenchSeries.map(b => <th key={b.key}>{b.label} index</th>)}
            <th>₹{fmt(baseAmt / 100000, 1)}L in Portfolio</th>
            {activeBenchSeries.map(b => (
              <th key={b.key}>₹{fmt(baseAmt / 100000, 1)}L in {b.shortLabel ?? b.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {milestones.map((d, i) => {
            const portVal = baseAmt * (d.value / baseP);
            return (
              <tr key={i}>
                <td className={styles.tdMonoText2}>{d.month}</td>
                <td className={styles.tdMonoAccent}>
                  {(d.value / baseP * 100).toFixed(1)}
                </td>

                {activeBenchSeries.map((b, bi) => {
                  const bVal = benchMaps[bi][d.month] ?? null;
                  const base = b.data[0]?.value || 1;
                  return (
                    /* bench.color is a CSS var — inline only because it's dynamic per benchmark */
                    <td key={b.key} className={styles.tdMonoBold} style={{ color: b.color }}>
                      {benchLoading ? '…' : bVal != null ? (bVal / base * 100).toFixed(1) : '—'}
                    </td>
                  );
                })}

                <td className={styles.tdMonoBold}>{fmtCr(portVal)}</td>

                {activeBenchSeries.map((b, bi) => {
                  const bVal  = benchMaps[bi][d.month] ?? null;
                  const base  = b.data[0]?.value || 1;
                  const bAmt  = bVal != null ? baseAmt * (bVal / base) : null;
                  const alpha = bAmt != null ? portVal - bAmt : null;
                  return (
                    <td key={b.key}>
                      {benchLoading ? (
                        <span className={styles.tdLoadingHint}>…</span>
                      ) : bAmt != null ? (
                        <>
                          <span className={styles.tdMono}>{fmtCr(bAmt)}</span>
                          {alpha != null && (
                            <span
                              className={styles.tdAlphaDelta}
                              style={{ color: colorPnl(alpha) }}
                            >
                              ({alpha >= 0 ? '+' : ''}{fmtCr(alpha)})
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Benchmark data status banner ─────────────────────────────────────────────

function BenchmarkStatusBanner({ loading, error, benchHistories, activeBenchKeys }) {
  if (!activeBenchKeys.length) return null;

  const fetchableKeys = activeBenchKeys.filter(k => k !== 'fd');
  if (!fetchableKeys.length) return null;

  if (loading) {
    return (
      <div className={styles.bannerLoading}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          className={styles.bannerSpinner}
        >
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
            {/* bench.color is a CSS var — inline only because it's dynamic per benchmark */}
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
              {stale        && <span className={styles.bannerStaleWarning}>⚠ fallback data may be stale</span>}
              {info.warning && <span className={styles.bannerStaleWarning}>⚠ {info.warning}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Mode toggle button ───────────────────────────────────────────────────────

function ModeButton({ label, value, active, onClick }) {
  // active state determines border/bg/color — stays inline (dynamic)
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

// ─── Main View ────────────────────────────────────────────────────────────────

export default function PortfolioVsNiftyView() {
  const { portfolioId, stats, setActiveView } = usePortfolio();
  const { snapshots, loading: snapshotsLoading } = useSnapshots(portfolioId, 100);

  const [mode, setMode]                       = useState('indexed');
  const prevSeriesLenRef                      = useRef(0);
  const [activeBenchKeys, setActiveBenchKeys] = useState(['nifty50']);

  const [benchHistories, setBenchHistories] = useState({});
  const [benchLoading,   setBenchLoading]   = useState(false);
  const [benchError,     setBenchError]     = useState(false);

  const firstSnapshotDate = snapshots[0]?.snapshotAt?.slice(0, 10);
  const prevFirstDateRef  = useRef(null);

  function toggleBenchmark(key) {
    setActiveBenchKeys(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  }

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
    setBenchLoading(true);
    setBenchError(false);
    if (dateChanged) setBenchHistories({});

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
      if (anyError) setBenchError(true);
      setBenchLoading(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSnapshotDate, activeBenchKeys.join(',')]);

  // ── Portfolio series ────────────────────────────────────────────────────────
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
    if (portfolioSeries.length !== prevSeriesLenRef.current) {
      prevSeriesLenRef.current = portfolioSeries.length;
      setMode('indexed');
    }
  }, [portfolioSeries.length]);

  // ── Benchmark raw series ────────────────────────────────────────────────────
  const activeBenchSeries = useMemo(() => {
    return activeBenchKeys.map(key => {
      const bench = BENCHMARKS[key];
      let data;
      if (key === 'fd') {
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
        color:      bench.color,                        // CSS var — for inline styles
        hexColor:   resolveBenchmarkColor(bench.color), // hex — for Recharts
        data,
      };
    });
  }, [activeBenchKeys, benchHistories, portfolioSeries]);

  // ── Rebased series for ComparisonChart ─────────────────────────────────────
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

  // ── Summary stats ───────────────────────────────────────────────────────────
  const primaryBench  = activeBenchSeries[0];
  const lastP         = rebasedPortfolio[rebasedPortfolio.length - 1];
  const lastPrimBench = primaryBench
    ? rebasedBenchSeries.find(b => b.key === primaryBench.key)?.data?.slice(-1)[0]
    : null;

  const pTotal         = lastP ? ((lastP.indexed / 100) - 1) * 100 : 0;
  const bTotal         = lastPrimBench ? ((lastPrimBench.indexed / 100) - 1) * 100 : 0;
  const alphaReturnPct = primaryBench ? pTotal - bTotal : null;
  const alphaIndexPts  = lastP && lastPrimBench ? lastP.indexed - lastPrimBench.indexed : null;

  const firstSnapshotDateFmt = snapshots[0]?.snapshotAt?.slice(0, 10);
  const latestSnapshotDate   = snapshots[snapshots.length - 1]?.snapshotAt?.slice(0, 10);

  // ── Guards ──────────────────────────────────────────────────────────────────
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

  // Alpha badge: gradient & border depend on sign — stays inline (dynamic)
  const alphaBg = alphaReturnPct > 0
    ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(20,184,166,0.06))'
    : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.06))';
  const alphaBorderColor = alphaReturnPct > 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className={`${styles.wrapper} fade-up`}>

      <BenchmarkStatusBanner
        loading={benchLoading}
        error={benchError}
        benchHistories={benchHistories}
        activeBenchKeys={activeBenchKeys}
      />

      <div className={`glass ${styles.selectorPanel}`}>
        <BenchmarkSelector active={activeBenchKeys} onChange={toggleBenchmark} />
      </div>

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

      <div className={`glass ${styles.chartPanel}`}>
        <div className={styles.chartHeader}>
          <div>
            <div className={styles.chartTitle}>
              {mode === 'cagr' ? 'Sub-portfolio CAGR trend' : 'Portfolio vs benchmarks'}
            </div>
            <div className={styles.chartSubtitle}>
              {mode === 'cagr'
                ? 'MF and stock CAGR captured in each saved snapshot'
                : 'Indexed to 100 at first snapshot — shows relative performance'}
              {mode === 'indexed' && benchLoading && (
                <span className={styles.chartSubtitleWarning}>
                  (benchmark lines use static data while live fetch completes)
                </span>
              )}
            </div>
          </div>
          <div className={styles.chartModeGroup}>
            {[['indexed', 'Indexed'], ['absolute', 'Absolute'], ['cagr', 'CAGR']].map(([v, l]) => (
              <ModeButton key={v} value={v} label={l} active={mode === v} onClick={setMode} />
            ))}
          </div>
        </div>

        {mode === 'indexed' && (
          <ComparisonChart
            portfolioSeries={rebasedPortfolio}
            benchmarkSeries={rebasedBenchSeries.map(b => ({
              ...b,
              color: b.hexColor, // Recharts needs resolved hex, not CSS vars
            }))}
          />
        )}
        {mode === 'absolute' && <AbsoluteChart portfolioSeries={portfolioSeries} />}
        {mode === 'cagr'     && <CagrTrendChart series={portfolioSeries} />}
      </div>

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

      <div className={`glass ${styles.hypotheticalPanel}`}>
        <div className={styles.hypotheticalHeader}>
          <div>
            <span className={styles.hypotheticalTitle}>
              Hypothetical growth — ₹{fmt(stats.totalInvested / 100000, 1)}L invested
            </span>
            <span className={styles.hypotheticalSub}>
              · What would the same capital look like in each benchmark?
            </span>
          </div>
          {benchLoading && (
            <span className={styles.hypotheticalLoadingBadge}>⏳ Loading benchmark data…</span>
          )}
        </div>
        <HypotheticalTable
          portfolioSeries={portfolioSeries}
          activeBenchSeries={activeBenchSeries}
          totalInvested={stats.totalInvested}
          benchLoading={benchLoading}
        />
      </div>

      <div className={styles.methodologyNote}>
        <strong className={styles.methodologyNoteStrong}>Methodology:</strong>{' '}
        Portfolio values are from saved snapshots. Benchmark data fetched live from Upstox V3 API
        (Nifty 50, Sensex, Nifty Midcap 100, Nifty Smallcap 100).
        FD/Risk-free line is synthetic at 7.1% p.a. compounded monthly.
        All series rebased to 100 at first snapshot for fair comparison.
        Alpha = portfolio return % − primary benchmark return % over the same period.
        Rolling returns use point-to-point % change on raw values.
        Save snapshots regularly for better chart granularity.
      </div>
    </div>
  );
}
