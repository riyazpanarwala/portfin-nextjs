'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmt } from '@/lib/store';
import {
  PriceCell, HoldingDetailPanel,
  HoldingsEmpty, HoldingsControls,
  RefreshPriceButton,
  ModeToggle, ExitedBanner,
  DataErrorBadge,
  HoldingsHeaderRow, HoldingsSummaryRefreshBar,
  HoldingCategoryBadge, HoldingMetricCells,
} from '@/components/views/HoldingsShared';
import { useMFView } from '@/hooks/useMFView';
import styles from './HoldingsTable.module.css';

const COL = '20px 1fr 90px 32px 80px 110px 85px 90px 85px 80px 88px 64px 130px 50px 28px';

export default function MFView() {
  const { mfHoldings, stats, setActiveView, priceMeta, refreshPrices, priceRefreshState } = usePortfolio();

  const isRefreshing = priceRefreshState?.active;

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
  const headerColumns = [
    '', 'FUND NAME', 'CAT', '#', 'UNITS',
    isExited ? 'LAST NAV' : 'CMP',
    'INVESTED', 'INV. PRICE', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD', '',
  ];

  return (
    <div className={`fade-up ${styles.wrapper}`}>

      <HoldingsSummaryRefreshBar
        items={summaryItems}
        onRefresh={() => refreshPrices('MF')}
        refreshing={isRefreshing}
        title={isRefreshing ? 'Refresh in progress…' : 'Refresh MF NAVs from AMFI'}
        label="Refresh NAVs"
        accentColor="rgba(20,184,166,0.06)"
        accentBorder="rgba(20,184,166,0.3)"
        textColor="var(--teal)"
        minWidth={80}
        tableStyles={styles}
        valueSize={18}
      />

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
            Click ✎ on CMP to manually set price · Click refresh icon on each row to fetch latest NAV from AMFI · Click row for SIP insights and tax exposure
          </>
        )}
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <HoldingsHeaderRow
          columns={headerColumns}
          gridTemplateColumns={COL}
          isExited={isExited}
          tableStyles={styles}
        />

        {rows.length === 0 ? (
          <div className={styles.tableEmpty}>
            {isExited ? 'No fully redeemed funds yet.' : 'No funds match the selected filter.'}
          </div>
        ) : rows.map(h => {
          const open        = !!expanded[h.symbol];
          const displayName = h.name || h.symbol;

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
                    <span className={styles.symbolText} title={displayName}>
                      {displayName}
                    </span>
                    {isExited && <span className={styles.exitedBadge}>EXITED</span>}
                    {h.hasDataError && <DataErrorBadge qty={h.unmatchedSellQty} />}
                  </div>
                  {h.sells?.length > 0 && (
                    <div className={styles.sellBadge}>
                      {h.sells.length} redemption{h.sells.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Category badge */}
                <div className={styles.sectorCell}>
                  <HoldingCategoryBadge label={h.sector || 'Other'} isExited={isExited} tableStyles={styles} />
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

                {/* NAV / CMP — editable only for active rows */}
                {isExited ? (
                  <div className={[styles.cmpCell, styles.cmpCellExited].join(' ')}>
                    ₹{fmt(h.cmp, 2)}
                  </div>
                ) : (
                  <div onClick={e => e.stopPropagation()}>
                    <PriceCell symbol={h.symbol} cmp={h.cmp} />
                  </div>
                )}

                <HoldingMetricCells h={h} isExited={isExited} maxRet={maxRet} tableStyles={styles} />

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
