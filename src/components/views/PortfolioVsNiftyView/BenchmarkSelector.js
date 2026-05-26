import { BENCHMARKS } from '@/lib/niftyData';
import styles from '../PortfolioVsNiftyView.module.css';
import { BENCH_KEYS } from './helpers';

export default function BenchmarkSelector({ active, onChange, benchHistories, pendingKeys }) {
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
