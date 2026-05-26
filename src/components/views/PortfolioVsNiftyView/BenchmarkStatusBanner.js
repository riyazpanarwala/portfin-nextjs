import { BENCHMARKS, benchmarkDataLastMonth, isBenchmarkDataStale } from '@/lib/niftyData';
import styles from '../PortfolioVsNiftyView.module.css';

export default function BenchmarkStatusBanner({ loading, error, benchHistories, activeBenchKeys }) {
  if (!activeBenchKeys.length) return null;
  const fetchableKeys = activeBenchKeys.filter(key => key !== 'fd');
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
