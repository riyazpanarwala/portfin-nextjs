'use client';

import { useState, useEffect, useRef } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { useSnapshots } from '@/hooks/useSnapshots';
import { useBenchmarkSeries } from '@/hooks/useBenchmarkSeries';
import { fmt, fmtPct, colorPnl } from '@/lib/store';
import { StatCard, EmptyState } from '@/components/ui/SharedUI';
import BenchmarkSelector from './PortfolioVsNiftyView/BenchmarkSelector';
import BenchmarkStatusBanner from './PortfolioVsNiftyView/BenchmarkStatusBanner';
import CalendarYearReturns from './PortfolioVsNiftyView/CalendarYearReturns';
import ChartPanel from './PortfolioVsNiftyView/ChartPanel';
import RollingReturns from './PortfolioVsNiftyView/RollingReturns';
import { formatPositiveReturn } from './PortfolioVsNiftyView/helpers';
import styles from './PortfolioVsNiftyView.module.css';

function LoadingState() {
  return (
    <div className={`${styles.skeletonStack} fade-up`}>
      {[140, 260, 100].map((height, index) => (
        <div key={index} className={`skeleton ${styles.skeletonBlock}`} style={{ height }} />
      ))}
    </div>
  );
}

function SnapshotEmptyState({ snapshotCount, onGoToSnapshots }) {
  return (
    <div className="fade-up">
      <EmptyState
        icon="📈"
        label="Not enough snapshot data yet"
        sub="You need at least 2 saved snapshots to draw a comparison chart."
        cta="Go to Snapshots"
        onCta={onGoToSnapshots}
        extra={
          <div className={styles.proTipBox}>
            <div className={styles.proTipLabel}>💡 Pro tip</div>
            {snapshotCount === 1
              ? '✅ You have 1 snapshot — save one more to unlock this chart.'
              : '📸 Go to Snapshot History and click "Save Snapshot Now" a few times over different days.'}
            <br />Save a snapshot weekly or monthly to build a rich comparison history.
          </div>
        }
      />
    </div>
  );
}

function AlphaBadge({ alphaReturnPct, alphaIndexPts, primaryBench, firstSnapshotDate, latestSnapshotDate }) {
  if (alphaReturnPct == null) return null;

  const alphaBg = alphaReturnPct > 0
    ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(20,184,166,0.06))'
    : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(245,158,11,0.06))';
  const alphaBorderColor = alphaReturnPct > 0 ? 'var(--green)' : 'var(--red)';

  return (
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
        {firstSnapshotDate} → {latestSnapshotDate}
      </div>
    </div>
  );
}

function StatsGrid({
  pTotal,
  bTotal,
  alphaReturnPct,
  alphaIndexPts,
  primaryBench,
  stats,
  snapshotCount,
  firstSnapshotDate,
  latestSnapshotDate,
}) {
  return (
    <div className={styles.statsGrid}>
      <StatCard
        label="Portfolio return"
        value={formatPositiveReturn(pTotal)}
        color={colorPnl(pTotal)}
        sub={`Since ${firstSnapshotDate}`}
      />
      {primaryBench && (
        <StatCard
          label={`${primaryBench.label} return`}
          value={formatPositiveReturn(bTotal)}
          color={primaryBench.color}
          sub="Same period"
        />
      )}
      <StatCard
        label="Alpha vs primary"
        value={alphaReturnPct != null ? formatPositiveReturn(alphaReturnPct) : '—'}
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
        value={snapshotCount}
        color="var(--accent2)"
        sub={`${firstSnapshotDate} → ${latestSnapshotDate}`}
      />
    </div>
  );
}

export default function PortfolioVsNiftyView() {
  const { portfolioId, stats, setActiveView, trades } = usePortfolio();
  const { snapshots, loading: snapshotsLoading } = useSnapshots(portfolioId);

  const [mode, setMode]                       = useState('indexed');
  const hasHadDataRef                         = useRef(false);
  const [activeBenchKeys, setActiveBenchKeys] = useState(['nifty50']);

  function toggleBenchmark(key) {
    setActiveBenchKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  const {
    activeBenchSeries,
    alphaIndexPts,
    alphaReturnPct,
    benchError,
    benchHistories,
    benchLoading,
    bTotal,
    exportComparisonCSV: handleExportCSV,
    firstSnapshotDate,
    latestSnapshotDate,
    pendingKeys,
    portfolioSeries,
    primaryBench,
    pTotal,
    rebasedBenchSeries,
    rebasedPortfolio,
  } = useBenchmarkSeries({ snapshots, activeBenchKeys });

  useEffect(() => {
    if (portfolioSeries.length > 0 && !hasHadDataRef.current) {
      hasHadDataRef.current = true;
      setMode('indexed');
    }
  }, [portfolioSeries.length]);

  if (snapshotsLoading) return <LoadingState />;

  if (snapshots.length < 2) {
    return (
      <SnapshotEmptyState
        snapshotCount={snapshots.length}
        onGoToSnapshots={() => setActiveView('snapshots')}
      />
    );
  }

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

      <StatsGrid
        pTotal={pTotal}
        bTotal={bTotal}
        alphaReturnPct={alphaReturnPct}
        alphaIndexPts={alphaIndexPts}
        primaryBench={primaryBench}
        stats={stats}
        snapshotCount={snapshots.length}
        firstSnapshotDate={firstSnapshotDate}
        latestSnapshotDate={latestSnapshotDate}
      />

      <AlphaBadge
        alphaReturnPct={alphaReturnPct}
        alphaIndexPts={alphaIndexPts}
        primaryBench={primaryBench}
        firstSnapshotDate={firstSnapshotDate}
        latestSnapshotDate={latestSnapshotDate}
      />

      <ChartPanel
        mode={mode}
        onModeChange={setMode}
        onExport={handleExportCSV}
        benchLoading={benchLoading}
        portfolioSeries={portfolioSeries}
        rebasedPortfolio={rebasedPortfolio}
        rebasedBenchSeries={rebasedBenchSeries}
      />

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
          trades={trades}
        />
      </div>

      <div className={`glass ${styles.calPanel}`}>
        <div className={styles.calPanelHeader}>
          <div>
            <div className={styles.calPanelTitle}>Calendar year returns</div>
            <div className={styles.calPanelSub}>
              Jan–Dec performance vs selected benchmarks · First year always shows &quot;—&quot; (no prior year-end baseline)
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
        <strong className={styles.methodologyNoteStrong}> Calendar year returns</strong> use last Dec snapshot ÷ prior Dec snapshot − 1; first year shows &quot;—&quot; (no baseline).
        Save snapshots regularly for better chart granularity.
      </div>
    </div>
  );
}
