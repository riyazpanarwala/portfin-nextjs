'use client';

import { RefreshCw, UserRound } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, colorPnl } from '@/lib/store';
import styles from './UI.module.css';

export default function Header({ onRefreshPrices }) {
  const { stats } = usePortfolio();
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <header className={styles.header}>
      <div className={styles.headerMetrics}>
        <MetricPill label="Total Value"  value={fmtCr(stats.totalValue)} />
        <Sep />
        <MetricPill
          label="Overall P&L"
          value={fmtCr(stats.totalGain)}
          sub={fmtPct(stats.totalReturnPct, true)}
          color={colorPnl(stats.totalGain)}
        />
        <Sep />
        <MetricPill label="MF CAGR" value={fmtPct(stats.mfCagr)} color="var(--accent2)" />
        <Sep />
        <MetricPill label="As of" value={dateStr} />
      </div>

      <div className={styles.headerRight}>
        {onRefreshPrices && (
          <button
            onClick={onRefreshPrices}
            className={`btn btn-ghost ${styles.refreshBtn}`}
            title="Refresh live prices"
          >
            <RefreshCw size={14} /> Prices
          </button>
        )}
        <div className={styles.liveIndicator}>
          <span className="live-dot" />
          <span className={styles.liveLabel}>LIVE</span>
        </div>
        <div className={styles.headerAvatar}>
          <UserRound size={15} />
        </div>
      </div>
    </header>
  );
}

function Sep() {
  return <div className={styles.headerSep} />;
}

function MetricPill({ label, value, sub, color }) {
  return (
    <div className={styles.metricPill}>
      <div className={styles.metricPillLabel}>{label}</div>
      <div className={styles.metricPillValueRow}>
        <span className={styles.metricPillValue} style={{ color: color || 'var(--text)' }}>
          {value || '—'}
        </span>
        {sub && (
          <span className={styles.metricPillSub} style={{ color: color || 'var(--text2)' }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
