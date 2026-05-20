'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import {
  pct, pcol, holdStr,
  ReturnBar, PriceCell, HoldingDetailPanel,
  HoldingsEmpty, HoldingsControls,
  RefreshPriceButton,
  ModeToggle, ExitedBanner,
} from '@/components/views/HoldingsShared';
import { useStocksView } from '@/hooks/useStocksView';
import styles from './HoldingsTable.module.css';

const COL = '20px 1fr 120px 32px 72px 110px 80px 80px 80px 88px 64px 130px 50px 28px';

function HeaderRow({ isExited }) {
  const cols = [
    '', 'STOCK', 'SECTOR', '#', 'QTY',
    isExited ? 'LAST PRICE' : 'CMP ✎',
    'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD', '',
  ];
  return (
    <div className={styles.headerRow} style={{ display: 'grid', gridTemplateColumns: COL }}>
      {cols.map((c, i) => (
        <div
          key={i}
          className={[
            styles.headerCell,
            i === 5 && !isExited ? styles.headerCellHighlight : '',
            i === 8              ? styles.headerCellYellow    : '',
          ].filter(Boolean).join(' ')}
          style={{ textAlign: i > 2 && i < cols.length - 1 ? 'right' : 'left' }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

export default function StocksView() {
  const { stHoldings, stats, setActiveView, priceMeta } = usePortfolio();

  const {
    sort, sector, setSector, filter, setFilter, expanded,
    mode, setMode, activeCount, exitedCount,
    sectors, rows, maxRet,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  } = useStocksView({ stHoldings, stats });

  if (!stHoldings.length) return (
    <HoldingsEmpty
      icon="◐"
      label="No stock holdings yet"
      cta="+ Add Stock Trade"
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
            <div className={styles.summaryCellValue} style={{ color: m.c, fontSize: 17 }}>
              {typeof m.v === 'string' ? m.v : fmtCr(m.v)}
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

      {/* Exited context banner */}
      {isExited && (
        <ExitedBanner message="Showing fully exited positions — all shares sold. Realized P&L and FIFO details available by expanding each row." />
      )}

      {/* Filter + sort controls */}
      <HoldingsControls
        groupLabel="SECTOR"
        groups={sectors}
        activeGroup={sector}
        onGroupChange={setSector}
        sort={sort}
        onSortToggle={toggleSort}
        onExport={() => exportCSV(fmt, holdStr)}
        extra={
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search…"
            style={{ width: 90, padding: '3px 8px', fontSize: 11 }}
          />
        }
      />

      {/* Hint bar */}
      <div className={styles.editHint}>
        {isExited ? (
          <>
            <span>ℹ</span>
            Click row to expand full FIFO sell history and realized P&amp;L breakdown
          </>
        ) : (
          <>
            <span className={styles.editHintAccent}>✎</span>
            Click edit icon next to CMP to update price · Click row to expand lot details + sell history ·
            <span className={styles.editHintTeal}>↺</span>
            Click refresh icon to fetch live price
          </>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <HeaderRow isExited={isExited} />

        {rows.length === 0 ? (
          <div className={styles.tableEmpty}>
            {isExited ? 'No fully exited positions yet.' : 'No stocks match the selected filter.'}
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

                {/* Symbol */}
                <div className={styles.symbolCell}>
                  <div className={styles.symbolNameRow}>
                    <span className={styles.symbolText}>{h.symbol}</span>
                    {isExited && <span className={styles.exitedBadge}>EXITED</span>}
                  </div>
                  {h.sells?.length > 0 && (
                    <div className={styles.sellBadge}>
                      {h.sells.length} sell{h.sells.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Sector */}
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

                {/* Qty */}
                <div className={[
                  styles.monoCell,
                  isExited ? styles.monoCellMuted : '',
                ].filter(Boolean).join(' ')}>
                  {isExited ? '—' : fmt(h.qty, 0)}
                </div>

                {/* CMP — editable only for active rows */}
                {isExited ? (
                  <div className={[styles.cmpCell, styles.cmpCellExited].join(' ')}>
                    ₹{fmt(h.cmp, 2)}
                  </div>
                ) : (
                  <div onClick={e => e.stopPropagation()}>
                    <PriceCell symbol={h.symbol} cmp={h.cmp} />
                  </div>
                )}

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
                  {!isExited && <RefreshPriceButton symbol={h.symbol} assetType="STOCK" />}
                </div>
              </div>

              {open && (
                <HoldingDetailPanel
                  h={h}
                  priceMeta={priceMeta}
                  qtyDecimals={0}
                  xirrLabel="Stock XIRR"
                  chartLabel="Investment Path vs Current CMP"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
