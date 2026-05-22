'use client';

import { usePortfolio } from '@/context/PortfolioContext';

/**
 * PriceRefreshOverlay
 * Full-screen blocking overlay shown while prices are being refreshed.
 * Renders nothing when idle.
 */
export default function PriceRefreshOverlay() {
  const { priceRefreshState } = usePortfolio();
  const { active, progress, current, updated, failed, total, done, assetType } = priceRefreshState;

  if (!active) return null;

  const label = assetType === 'MF'    ? 'Mutual Fund NAVs'
              : assetType === 'STOCK' ? 'Stock Prices'
              : 'All Prices';

  const statusColor = done
    ? failed > 0 ? 'var(--yellow)' : 'var(--green2)'
    : 'var(--accent2)';

  return (
    <div style={{
      position:        'fixed',
      inset:           0,
      zIndex:          9999,
      background:      'rgba(7, 11, 20, 0.82)',
      backdropFilter:  'blur(6px)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
    }}>
      <div style={{
        background:    'var(--bg2)',
        border:        `1px solid ${done ? statusColor : 'var(--border2)'}`,
        borderRadius:  16,
        padding:       '36px 44px',
        minWidth:      360,
        maxWidth:      460,
        boxShadow:     '0 24px 80px rgba(0,0,0,0.6)',
        display:       'flex',
        flexDirection: 'column',
        gap:           20,
        transition:    'border-color 0.3s',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {done ? (
            <div style={{
              width:        40, height: 40, borderRadius: '50%',
              background:   failed > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
              border:       `1px solid ${statusColor}`,
              display:      'flex', alignItems: 'center', justifyContent: 'center',
              fontSize:     20, flexShrink: 0,
            }}>
              {failed > 0 ? '⚠' : '✓'}
            </div>
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="var(--accent2)"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </div>
          )}

          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {done ? 'Refresh Complete' : `Refreshing ${label}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {done
                ? `${updated} updated${failed > 0 ? `, ${failed} failed` : ''} of ${total} symbols`
                : `${total} symbol${total !== 1 ? 's' : ''} to update`}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div style={{
            height: 6, background: 'var(--bg3)',
            borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width:  `${progress}%`,
              background: done
                ? (failed > 0 ? 'var(--yellow)' : 'linear-gradient(90deg, var(--green), var(--teal))')
                : 'linear-gradient(90deg, var(--accent), var(--purple))',
              borderRadius: 3,
              transition: 'width 0.35s ease, background 0.3s',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 6, fontSize: 10,
            fontFamily: 'var(--font-mono)', color: 'var(--text3)',
          }}>
            <span>{progress}%</span>
            <span>{updated} updated · {failed} failed</span>
          </div>
        </div>

        {/* Current symbol being fetched */}
        {!done && current && (
          <div style={{
            padding:      '8px 12px',
            background:   'var(--bg3)',
            borderRadius: 8,
            fontSize:     12,
            color:        'var(--text2)',
            fontFamily:   'var(--font-mono)',
            display:      'flex',
            alignItems:   'center',
            gap:          8,
          }}>
            <span className="live-dot" />
            Fetching {current}…
          </div>
        )}

        {/* Done result chips */}
        {done && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>
                {updated}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>UPDATED</div>
            </div>
            {failed > 0 && (
              <div style={{
                flex: 1, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>
                  {failed}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>FAILED</div>
              </div>
            )}
            <div style={{
              flex: 1, padding: '10px 14px', borderRadius: 8,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                {total}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>TOTAL</div>
            </div>
          </div>
        )}

        {/* Auto-dismiss hint */}
        {done && (
          <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
            Closing automatically…
          </div>
        )}
      </div>
    </div>
  );
}
