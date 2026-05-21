'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import {
  pct, pcol, holdStr,
  ReturnBar, HoldingDetailPanel,
  HoldingsEmpty, HoldingsControls,
  RefreshPriceButton,
  ModeToggle, ExitedBanner,
  DataErrorBadge,
} from '@/components/views/HoldingsShared';
import { useMFView } from '@/hooks/useMFView';
import styles from './HoldingsTable.module.css';

const COL = '20px 1fr 80px 32px 72px 72px 80px 80px 80px 88px 64px 130px 50px 28px';

function HeaderRow({ isExited }) {
  const cols = [
    '', 'FUND NAME', 'CAT', '#', 'UNITS',
    isExited ? 'LAST NAV' : 'CMP',
    'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD', '',
  ];
  return (
    <div className={styles.headerRow} style={{ display: 'grid', gridTemplateColumns: COL }}>
      {cols.map((c, i) => (
        <div
          key={i}
          className={[
            styles.headerCell,
            i === 8 ? styles.headerCellYellow : '',
          ].filter(Boolean).join(' ')}
          style={{ textAlign: i > 2 && i < cols.length - 1 ? 'right' : 'left' }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

export default function MFView() {
  const { mfHoldings, stats, setActiveView, priceMeta } = usePortfolio();

  const {
    sort, category, setCategory, expanded,
    mode, setMode, activeCount, exitedCount,
    dataErrorCount,
    categories, rows, maxRet,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  } = useMFView({ mfHoldings, stats });

  if (!mfHoldings.length) return (
    <HoldingsEmpty
      icon="◎"
      label="No mutual funds yet"
      cta="+ Add MF Trade"
      onCta={() => setActiveView('trade')}
    />
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
            {m.sub && <div className={styles.summaryCellSub}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Data error banner if any */}
      {dataErrorCount > 0 && (
        <div className={styles.dataErrorBanner}>
          ⚠ {dataErrorCount} fund{dataErrorCount > 1 ? 's have' : ' has'} FIFO mismatches — some sell trades have no matching buys. Expand those rows for details.
        </div>
      )}

      {/* Active / Exited toggle */}
      <ModeToggle
        mode={mode}
        setMode={setMode}
        activeCount={activeCount}
        exitedCount={exitedCount}
      />

      {/* Exited context banner */}
      {isExited && (
        <ExitedBanner message="Showing fully redeemed funds — all units sold. Realized P&L and redemption history available by expanding each row." />
      )}

      {/* Filter + sort controls */}
      <HoldingsControls
        groupLabel="CATEGORY"
        groups={categories}
        activeGroup={category}
        onGroupChange={setCategory}
        sort={sort}
        onSortToggle={toggleSort}
        onExport={() => exportCSV(fmt)}
      />

      {/* Hint bar */}
      <div className={styles.editHint}>
        {isExited ? (
          <>
            <span>ℹ</span>
            Click row to expand full redemption history, SIP consistency, and realized P&amp;L breakdown
          </>
        ) : (
          <>
            <span className={styles.editHintTeal}>↺</span>
            Click refresh icon on each row to fetch latest NAV from AMFI · Click row for SIP insights and tax exposure
          </>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <HeaderRow isExited={isExited} />

        {rows.length === 0 ? (
          <div className={styles.tableEmpty}>
            {isExited ? 'No fully redeemed funds yet.' : 'No funds match the selected filter.'}
          </div>
        ) : rows.map(h => {
          const open        = !!expanded[h.symbol];
          const hasRealized = (h.realizedGain || 0) !== 0;

          return (
            <div key={h.symbol} className={styles.rowOuter}>
              <div
                className={[
                  styles.dataRow,
                  open     ? styles.dataRowExpanded : '',
                  isExited ? styles.dataRowExited   : '',
                ].filter(Boolean).join(' ')}
                onClick={() => toggleExpanded(h.symbol)}
                style={{ display: 'grid', gridTemplateColumns: COL }}
              >
                <div className={styles.expandChevron}>{open ? '▼' : '►'}</div>

                {/* Fund name */}
                <div className={styles.symbolCell}>
                  <div className={styles.symbolNameRow}>
                    <span className={styles.symbolText} title={h.name || h.symbol}>
                      {h.symbol}
                    </span>
                    {isExited && <span className={styles.exitedBadge}>EXITED</span>}
                    {h.hasDataError && <DataErrorBadge qty={h.unmatchedSellQty} />}
                  </div>
                  {h.name && h.name !== h.symbol && (
                    <div className={styles.fundName}>{h.name}</div>
                  )}
                  {h.sells?.length > 0 && (
                    <div className={styles.sellBadge}>
                      {h.sells.length} redemption{h.sells.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Category badge */}
                <div className={styles.sectorCell}>
                  <span
                    className={[
                      styles.sectorBadge,
                      isExited ? styles.sectorBadgeExited : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      background: `${sectorColor(h.sector || 'Other')}20`,
                      color:      sectorColor(h.sector || 'Other'),
                      border:     `1px solid ${sectorColor(h.sector || 'Other')}40`,
                    }}
                  >
                    {h.sector || 'Other'}
                  </span>
                </div>

                {/* # lots */}
                <div className={styles.monoCell}>{h.lots.length}</div>

                {/* Units */}
                <div className={[
                  styles.monoCell,
                  isExited ? styles.monoCellMuted : '',
                ].filter(Boolean).join(' ')}>
                  {isExited ? '—' : fmt(h.qty, 2)}
                </div>

                {/* NAV */}
                <div className={[
                  styles.cmpCell,
                  isExited ? styles.cmpCellExited : '',
                ].filter(Boolean).join(' ')}>
                  ₹{fmt(h.cmp, 2)}
                </div>

                {/* Invested */}
                <div className={styles.monoCell}>{fmtCr(h.invested)}</div>

                {/* Value */}
                <div className={[
                  styles.monoCellBold,
                  isExited ? styles.monoCellMuted : '',
                ].filter(Boolean).join(' ')}>
                  {isExited ? '—' : fmtCr(h.marketValue)}
                </div>

                {/* Realized */}
                <div
                  className={`${styles.monoCell} ${styles.monoCellRealized}`}
                  style={{ color: hasRealized ? colorPnl(h.realizedGain) : 'var(--text3)' }}
                >
                  {hasRealized ? fmtCr(h.realizedGain) : '—'}
                </div>

                {/* Gain — realized for exited rows; unrealized for active */}
                <div
                  className={`${styles.monoCell} ${styles.monoCellGain}`}
                  style={{ color: colorPnl(isExited ? h.realizedGain : h.unrealizedGain) }}
                >
                  {fmtCr(isExited ? h.realizedGain : h.unrealizedGain)}
                </div>

                {/* CAGR */}
                <div
                  className={`${styles.monoCell} ${styles.monoCellCagr}`}
                  style={{ color: pcol(h.cagr) }}
                >
                  {pct(h.cagr)}
                </div>

                {/* Return bar */}
                <div className={styles.returnBarCell}>
                  <ReturnBar val={h.returnPct} max={maxRet} />
                </div>

                {/* Holding period */}
                <div className={styles.holdCell}>{holdStr(h.holdingDays)}</div>

                {/* Refresh btn — hidden for exited rows */}
                <div className={styles.refreshCell} onClick={e => e.stopPropagation()}>
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
                  assetType="MF"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
