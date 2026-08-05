'use client';

import { RefreshCw, LogOut, Eye, EyeOff } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import { fmtCr, fmtPct, colorPnl } from '@/lib/store';
import styles from './UI.module.css';

export default function Header({ onRefreshPrices }) {
  const { stats, priceRefreshState, isDiscreet, toggleDiscreet } = usePortfolio();
  const { user, logout }             = useAuth();
  const isRefreshing = priceRefreshState?.active;

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  // Derive initials from displayName or email
  const displayName = user?.displayName || user?.email || '';
  const initials = displayName
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || 'U';

  return (
    <header className={styles.header}>
      <div className={styles.headerMetrics}>
        <MetricPill label="Total Value" value={fmtCr(stats.totalValue)} isMonetary />
        <div className={styles.headerSep} />
        <MetricPill
          label="Overall P&L"
          value={fmtCr(stats.totalGain)}
          sub={fmtPct(stats.totalReturnPct, true)}
          color={colorPnl(stats.totalGain)}
          isMonetary
        />
        <div className={styles.headerSep} />
        <MetricPill label="MF CAGR" value={fmtPct(stats.mfCagr)} color="var(--accent2)" />
        <div className={styles.headerSep} />
        <MetricPill label="As of" value={dateStr} />
      </div>

      <div className={styles.headerRight}>
        {/* Discreet / Privacy Mode Toggle Button */}
        <button
          onClick={toggleDiscreet}
          className={`btn btn-ghost ${isDiscreet ? 'active' : ''}`}
          title={isDiscreet ? 'Privacy Mode ON (Click to reveal numbers)' : 'Privacy Mode OFF (Click to hide numbers)'}
          style={{
            padding: '5px 10px',
            fontSize: 11,
            gap: 5,
            borderColor: isDiscreet ? 'rgba(139,92,246,0.5)' : undefined,
            background: isDiscreet ? 'rgba(139,92,246,0.15)' : undefined,
            color: isDiscreet ? 'var(--purple)' : 'var(--text2)',
          }}
        >
          {isDiscreet ? <EyeOff size={14} /> : <Eye size={14} />}
          <span style={{ fontSize: 11, fontWeight: 600 }}>
            {isDiscreet ? 'Hidden' : 'Hide'}
          </span>
        </button>

        {onRefreshPrices && (
          <button
            onClick={isRefreshing ? undefined : onRefreshPrices}
            disabled={isRefreshing}
            className={`btn btn-ghost ${styles.refreshBtn}`}
            title={isRefreshing ? 'Refresh in progress…' : 'Refresh all live prices'}
            style={{
              opacity:       isRefreshing ? 0.55 : 1,
              cursor:        isRefreshing ? 'not-allowed' : 'pointer',
              pointerEvents: isRefreshing ? 'none' : 'auto',
            }}
          >
            <RefreshCw
              size={14}
              style={isRefreshing ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            {isRefreshing ? 'Refreshing…' : 'Prices'}
          </button>
        )}

        <div className={styles.liveIndicator}>
          <span className="live-dot" />
          <span className={styles.liveLabel}>LIVE</span>
        </div>

        {/* User avatar — shows initials, tooltip shows full email */}
        <div
          title={user?.email || ''}
          className={styles.headerAvatar}
          style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.03em' }}
        >
          {initials}
        </div>

        {/* Sign out */}
        <button
          onClick={logout}
          className="btn btn-ghost"
          title={`Sign out (${user?.email || ''})`}
          style={{ padding: '5px 10px', fontSize: 11, gap: 5 }}
        >
          <LogOut size={13} />
        </button>
      </div>
    </header>
  );
}

function MetricPill({ label, value, sub, color, isMonetary }) {
  return (
    <div className={styles.metricPill}>
      <div className={styles.metricPillLabel}>{label}</div>
      <div className={styles.metricPillValueRow}>
        <span
          className={`${styles.metricPillValue} ${isMonetary ? 'privacy-mask' : ''}`}
          style={{ color: color || 'var(--text)' }}
        >
          {value || '—'}
        </span>
        {sub && (
          <span
            className={`${styles.metricPillSub} ${isMonetary ? 'privacy-mask' : ''}`}
            style={{ color: color || 'var(--text2)' }}
          >
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
