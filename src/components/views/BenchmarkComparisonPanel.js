'use client';

/**
 * BenchmarkComparisonPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for the static benchmark table in AnalyticsView.
 *
 * HOW TO USE:
 *   1. Copy useBenchmarkComparison.js → src/hooks/useBenchmarkComparison.js
 *   2. In AnalyticsView.js, import this component:
 *        import { BenchmarkComparisonPanel } from '@/components/views/BenchmarkComparisonPanel';
 *   3. Replace the static benchmark table block (inside analyticsTab === 'overview')
 *      with:
 *        <BenchmarkComparisonPanel snapshots={snapshots} stats={stats} />
 *
 * WHAT IT SHOWS:
 *   - Live 1Y, 3Y CAGR, 5Y CAGR for Nifty 50 / Sensex / Nifty Midcap / Nifty Smallcap
 *   - Portfolio's actual point-to-point returns derived from saved snapshots
 *   - Colour-coded alpha (portfolio vs each benchmark)
 *   - Data source indicator (live Upstox / fallback)
 */

import { useBenchmarkComparison } from '@/hooks/useBenchmarkComparison';
import { resolveColor } from '@/lib/colorResolver';

const fmt = (n, d = 1) =>
  n == null || isNaN(n) ? '—' : Number(n).toFixed(d) + '%';

const colorPnl = (n) =>
  n == null ? 'var(--text2)'
  : n > 0 ? 'var(--green2)' : n < 0 ? 'var(--red2)' : 'var(--text2)';

// Small alpha badge: ▲/▼ Xpp
function AlphaBadge({ portReturn, benchReturn }) {
  if (portReturn == null || benchReturn == null) return <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>;
  const alpha = portReturn - benchReturn;
  const positive = alpha >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
      color: positive ? 'var(--green2)' : 'var(--red2)',
      background: positive ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
      border: `1px solid ${positive ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
      borderRadius: 4, padding: '1px 6px',
    }}>
      {positive ? '▲' : '▼'} {Math.abs(alpha).toFixed(1)}pp
    </span>
  );
}

export function BenchmarkComparisonPanel({ snapshots, stats }) {
  const { loading, benchmarkRows, portfolioRow, anyFallback, currentMonth } =
    useBenchmarkComparison({ snapshots, stats });

  const SPINNER = (
    <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(148,169,196,0.3)" strokeWidth="2.5" />
      <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="var(--accent2)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );

  const th = {
    fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.08em',
    padding: '8px 12px', background: 'var(--bg3)', textAlign: 'right',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  };
  const thLeft = { ...th, textAlign: 'left' };
  const td = (extra = {}) => ({
    padding: '9px 12px', borderBottom: '1px solid rgba(45,64,96,0.3)',
    fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right', ...extra,
  });

  return (
    <div className="glass" style={{ padding: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Benchmark Comparison</div>
        {loading
          ? <span style={{ fontSize: 11, color: 'var(--accent2)' }}>{SPINNER}Fetching live data…</span>
          : anyFallback
          ? <span style={{ fontSize: 11, color: 'var(--yellow)' }}>⚠ Some benchmarks using fallback data</span>
          : <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--green2)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green2)', display: 'inline-block' }} />
              Live · Upstox · {currentMonth}
            </span>
        }
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
        Point-to-point returns · 3Y and 5Y shown as annualised CAGR · Alpha = portfolio minus benchmark
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={thLeft}>BENCHMARK</th>
              <th style={th}>1Y RETURN</th>
              <th style={th}>ALPHA (1Y)</th>
              <th style={th}>3Y CAGR</th>
              <th style={th}>ALPHA (3Y)</th>
              <th style={th}>5Y CAGR</th>
              <th style={th}>ALPHA (5Y)</th>
            </tr>
          </thead>
          <tbody>
            {/* Benchmark rows */}
            {benchmarkRows.map((b) => (
              <tr key={b.key}>
                <td style={{ ...td({ textAlign: 'left' }), fontFamily: 'var(--font-main)', fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                      background: resolveColor(b.color, '#94a9c4'),
                    }} />
                    <span style={{ color: 'var(--text)' }}>{b.name}</span>
                    {b.usingFallback && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        background: 'rgba(245,158,11,0.15)', color: 'var(--yellow)',
                        border: '1px solid rgba(245,158,11,0.3)', fontWeight: 700,
                      }}>FALLBACK</span>
                    )}
                  </div>
                </td>
                <td style={{ ...td(), color: colorPnl(b.ret1y), fontWeight: 600 }}>
                  {loading ? '…' : fmt(b.ret1y)}
                </td>
                <td style={{ ...td(), padding: '9px 8px' }}>
                  {loading ? '—' : <AlphaBadge portReturn={portfolioRow.ret1y} benchReturn={b.ret1y} />}
                </td>
                <td style={{ ...td(), color: colorPnl(b.ret3yCA), fontWeight: 600 }}>
                  {loading ? '…' : fmt(b.ret3yCA)}
                </td>
                <td style={{ ...td(), padding: '9px 8px' }}>
                  {loading ? '—' : <AlphaBadge portReturn={portfolioRow.ret3yCA} benchReturn={b.ret3yCA} />}
                </td>
                <td style={{ ...td(), color: colorPnl(b.ret5yCA), fontWeight: 600 }}>
                  {loading ? '…' : fmt(b.ret5yCA)}
                </td>
                <td style={{ ...td(), padding: '9px 8px' }}>
                  {loading ? '—' : <AlphaBadge portReturn={portfolioRow.ret5yCA} benchReturn={b.ret5yCA} />}
                </td>
              </tr>
            ))}

            {/* Portfolio row */}
            <tr style={{ background: 'rgba(59,130,246,0.08)' }}>
              <td style={{ ...td({ textAlign: 'left' }), fontFamily: 'var(--font-main)', fontWeight: 700, color: 'var(--accent2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent2)', flexShrink: 0 }} />
                  Your Portfolio
                  {!portfolioRow.hasSnapData && (
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(245,158,11,0.15)', color: 'var(--yellow)',
                      border: '1px solid rgba(245,158,11,0.3)', fontWeight: 700,
                    }}>EST</span>
                  )}
                </div>
              </td>

              {/* 1Y */}
              <td style={{ ...td(), fontWeight: 800, fontSize: 13 }}>
                {portfolioRow.ret1y != null
                  ? <span style={{ color: colorPnl(portfolioRow.ret1y) }}>{fmt(portfolioRow.ret1y)}</span>
                  : <span style={{ color: 'var(--text3)', fontSize: 11 }}>Save snapshots</span>
                }
              </td>
              <td style={td()} />

              {/* 3Y CAGR */}
              <td style={{ ...td(), fontWeight: 800, fontSize: 13 }}>
                {portfolioRow.ret3yCA != null
                  ? <span style={{ color: colorPnl(portfolioRow.ret3yCA) }}>{fmt(portfolioRow.ret3yCA)}</span>
                  : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                }
              </td>
              <td style={td()} />

              {/* 5Y CAGR */}
              <td style={{ ...td(), fontWeight: 800, fontSize: 13 }}>
                {portfolioRow.ret5yCA != null
                  ? <span style={{ color: colorPnl(portfolioRow.ret5yCA) }}>{fmt(portfolioRow.ret5yCA)}</span>
                  : portfolioRow.cagrEstimate != null
                  ? <span style={{ color: colorPnl(portfolioRow.cagrEstimate) }}>
                      {fmt(portfolioRow.cagrEstimate)}
                      <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 3 }}>est</span>
                    </span>
                  : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>
                }
              </td>
              <td style={td()} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text3)', lineHeight: 1.7 }}>
        {!portfolioRow.hasSnapData
          ? '💡 Portfolio 1Y/3Y/5Y figures require saved snapshots. Use the Snapshot History tab to save a monthly checkpoint — or run Backfill to reconstruct historical values.'
          : '3Y and 5Y portfolio returns are point-to-point from saved snapshots, annualised to CAGR for comparison. Benchmark data via Upstox V3 (index instruments, no auth required).'
        }
      </div>
    </div>
  );
}
