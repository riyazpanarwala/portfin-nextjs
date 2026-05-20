'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import {
  pct, pcol, holdStr,
  ReturnBar, HoldingDetailPanel,
  HoldingsEmpty, HoldingsControls,
  RefreshPriceButton,
} from '@/components/views/HoldingsShared';
import { useMFView } from '@/hooks/useMFView';
import styles from './HoldingsTable.module.css';

// Added a 28px column at the end for the refresh button
const COL = '20px 1fr 80px 32px 72px 72px 80px 80px 80px 88px 64px 130px 50px 28px';

function HeaderRow({ isExited }) {
  const navLabel = isExited ? 'LAST NAV' : 'CMP';
  const cols = ['', 'FUND NAME', 'CAT', '#', 'UNITS', navLabel, 'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD', ''];
  return (
    <div className={styles.headerRow} style={{ display: 'grid', gridTemplateColumns: COL }}>
      {cols.map((c, i) => (
        <div
          key={i}
          className={`${styles.headerCell} ${i === 8 ? styles.headerCellYellow : ''}`}
          style={{ textAlign: i > 2 && i < cols.length - 1 ? 'right' : 'left' }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

// ── Active/Exited segment control ─────────────────────────────────────────────
function ModeToggle({ mode, setMode, activeCount, exitedCount }) {
  const tabs = [
    { key: 'active', label: 'Active',  count: activeCount, color: 'var(--accent2)', activeBg: 'rgba(59,130,246,0.15)',   activeBorder: 'var(--accent)' },
    { key: 'exited', label: 'Exited',  count: exitedCount, color: 'var(--text3)',   activeBg: 'rgba(148,169,196,0.1)',   activeBorder: 'var(--border2)' },
  ];

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {tabs.map(t => {
        const on = mode === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          7,
              padding:      '6px 14px',
              borderRadius: 8,
              border:       `1px solid ${on ? t.activeBorder : 'var(--border)'}`,
              background:   on ? t.activeBg : 'transparent',
              color:        on ? t.color : 'var(--text3)',
              cursor:       'pointer',
              fontFamily:   'var(--font-main)',
              fontSize:     12,
              fontWeight:   700,
              transition:   'all 0.15s',
            }}
          >
            {t.label}
            <span style={{
              fontSize:     10,
              fontFamily:   'var(--font-mono)',
              fontWeight:   700,
              padding:      '1px 6px',
              borderRadius: 4,
              background:   on ? (t.key === 'active' ? 'rgba(59,130,246,0.25)' : 'rgba(148,169,196,0.15)') : 'var(--bg3)',
              color:        on ? t.color : 'var(--text3)',
              border:       `1px solid ${on ? t.activeBorder : 'transparent'}`,
            }}>
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function MFView() {
  const { mfHoldings, stats, setActiveView, priceMeta } = usePortfolio();

  const {
    sort, category, setCategory, expanded,
    mode, setMode, activeCount, exitedCount,
    categories, rows, maxRet, mfGain, mfRealized,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  } = useMFView({ mfHoldings, stats });

  if (!mfHoldings.length) return (
    <HoldingsEmpty icon="◎" label="No mutual funds yet" cta="+ Add MF Trade" onCta={() => setActiveView('trade')} />
  );

  const isExited = mode === 'exited';

  return (
    <div className={`fade-up ${styles.wrapper}`}>

      {/* Summary strip */}
      <div className={styles.summaryStrip}>
        {summaryItems.map((m, i) => (
          <div key={i} className={styles.summaryCell}>
            <div className={styles.summaryCellLabel}>{m.l}</div>
            <div className={styles.summaryCellValue} style={{ color: m.c, fontSize: 18 }}>
              {m.format ? m.format(m.v) : m.v}
            </div>
          </div>
        ))}
      </div>

      {/* Active / Exited toggle */}
      <ModeToggle
        mode={mode}
        setMode={setMode}
        activeCount={activeCount}
        exitedCount={exitedCount}
      />

      {/* Exited banner */}
      {isExited && (
        <div style={{
          padding:      '8px 14px',
          marginBottom: 8,
          background:   'rgba(148,169,196,0.06)',
          border:       '1px solid rgba(148,169,196,0.15)',
          borderRadius: 8,
          fontSize:     12,
          color:        'var(--text3)',
          display:      'flex',
          alignItems:   'center',
          gap:          8,
        }}>
          <span>📋</span>
          Showing fully redeemed funds — all units sold. Realized P&amp;L and redemption history available by expanding each row.
        </div>
      )}

      <HoldingsControls
        groupLabel="CATEGORY"
        groups={categories}
        activeGroup={category}
        onGroupChange={setCategory}
        sort={sort}
        onSortToggle={toggleSort}
        onExport={() => exportCSV(fmt)}
      />

      {/* Edit hint */}
      {!isExited && (
        <div className={styles.editHint} style={{ marginBottom: 6 }}>
          <span style={{ color: 'var(--teal)' }}>↺</span>
          <span style={{ marginLeft: 3 }}>Click refresh icon on each row to fetch latest NAV from AMFI</span>
        </div>
      )}
      {isExited && (
        <div className={styles.editHint} style={{ marginBottom: 6 }}>
          <span style={{ color: 'var(--text3)' }}>ℹ</span>
          <span style={{ marginLeft: 3 }}>Click row to expand full redemption history and realized P&amp;L breakdown</span>
        </div>
      )}

      {/* Table */}
      <div className={styles.tableContainer}>
        <HeaderRow isExited={isExited} />

        {rows.length === 0 ? (
          <div className={styles.tableEmpty}>
            {isExited
              ? 'No fully redeemed funds yet.'
              : 'No funds match the selected filter.'}
          </div>
        ) : rows.map(h => {
          const open        = !!expanded[h.symbol];
          const hasRealized = (h.realizedGain || 0) !== 0;

          return (
            <div key={h.symbol} style={{ borderBottom: '1px solid rgba(45,64,96,0.35)' }}>
              <div
                className={`${styles.dataRow} ${open ? styles.dataRowExpanded : ''}`}
                onClick={() => toggleExpanded(h.symbol)}
                style={{
                  display: 'grid', gridTemplateColumns: COL,
                  opacity: isExited ? 0.82 : 1,
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
              >
                <div className={styles.expandChevron}>{open ? '▼' : '►'}</div>

                {/* Fund name */}
                <div className={styles.symbolCell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={styles.symbolText} title={h.name || h.symbol}>{h.symbol}</span>
                    {isExited && (
                      <span style={{
                        fontSize:     9,
                        fontWeight:   700,
                        padding:      '1px 5px',
                        borderRadius: 3,
                        background:   'rgba(148,169,196,0.12)',
                        color:        'var(--text3)',
                        border:       '1px solid rgba(148,169,196,0.2)',
                        letterSpacing: '0.05em',
                      }}>EXITED</span>
                    )}
                  </div>
                  {h.name && h.name !== h.symbol && (
                    <div className={styles.fundName}>{h.name}</div>
                  )}
                  {h.sells?.length > 0 && (
                    <div className={styles.sellBadge}>{h.sells.length} redemption{h.sells.length > 1 ? 's' : ''}</div>
                  )}
                </div>

                {/* Category badge */}
                <div className={styles.sectorCell}>
                  <span
                    className={styles.sectorBadge}
                    style={{
                      background: `${sectorColor(h.sector || 'Other')}20`,
                      color:      sectorColor(h.sector || 'Other'),
                      border:     `1px solid ${sectorColor(h.sector || 'Other')}40`,
                      opacity:    isExited ? 0.7 : 1,
                    }}
                  >
                    {h.sector || 'Other'}
                  </span>
                </div>

                <div className={styles.monoCell}>{h.lots.length}</div>
                {/* Units — 0 for exited */}
                <div className={styles.monoCell} style={{ color: isExited ? 'var(--text3)' : undefined }}>
                  {isExited ? '—' : fmt(h.qty, 2)}
                </div>
                <div className={styles.cmpCell} style={{ color: isExited ? 'var(--text3)' : undefined }}>
                  ₹{fmt(h.cmp, 2)}
                </div>
                <div className={styles.monoCell}>{fmtCr(h.invested)}</div>
                {/* Value is 0 for exited */}
                <div className={styles.monoCellBold} style={{ color: isExited ? 'var(--text3)' : undefined }}>
                  {isExited ? '—' : fmtCr(h.marketValue)}
                </div>

                <div className={styles.monoCell} style={{ fontWeight: 600, color: hasRealized ? colorPnl(h.realizedGain) : 'var(--text3)' }}>
                  {hasRealized ? fmtCr(h.realizedGain) : '—'}
                </div>
                {/* For exited rows show total gain (= realized); for active show unrealized */}
                <div className={styles.monoCell} style={{ fontWeight: 600, color: isExited ? colorPnl(h.realizedGain) : colorPnl(h.unrealizedGain) }}>
                  {isExited ? fmtCr(h.realizedGain) : fmtCr(h.unrealizedGain)}
                </div>
                <div className={styles.monoCell} style={{ fontWeight: 700, color: pcol(h.cagr) }}>{pct(h.cagr)}</div>
                <div className={styles.returnBarCell}><ReturnBar val={h.returnPct} max={maxRet} /></div>
                <div className={styles.holdCell}>{holdStr(h.holdingDays)}</div>

                {/* Per-row live NAV refresh button — hide for exited */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}
                  onClick={e => e.stopPropagation()}
                >
                  {!isExited && <RefreshPriceButton symbol={h.symbol} assetType="MF" />}
                </div>
              </div>

              {open && (
                <HoldingDetailPanel
                  h={h}
                  priceMeta={priceMeta}
                  qtyDecimals={3}
                  xirrLabel="Fund XIRR"
                  chartLabel="Investment Path vs Current NAV"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
