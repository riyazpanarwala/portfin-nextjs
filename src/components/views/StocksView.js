'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt } from '@/lib/store';
import { AllocationDonutChart } from '@/components/charts/Charts';
import {
  holdStr,
  PriceCell, HoldingDetailPanel,
  HoldingsEmpty, HoldingsControls,
  RefreshPriceButton,
  ModeToggle, ExitedBanner,
  DataErrorBadge, ConcentrationBadge,
  HoldingsHeaderRow, HoldingsSummaryRefreshBar,
  HoldingCategoryBadge, HoldingMetricCells,
} from '@/components/views/HoldingsShared';
import { useStocksView } from '@/hooks/useStocksView';
import styles from './HoldingsTable.module.css';

const COL = '20px 1fr 120px 32px 72px 110px 80px 90px 80px 80px 88px 64px 130px 50px 28px';

export default function StocksView() {
  const { stHoldings, stats, setActiveView, priceMeta, refreshPrices, priceRefreshState } = usePortfolio();

  const isRefreshing = priceRefreshState?.active;

  const {
    sort, sector, setSector, filter, setFilter, expanded,
    mode, setMode, activeCount, exitedCount,
    dataErrorCount, concentrationMap, daysSinceLastBuyMap,
    stockAllocationData,
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
  const headerColumns = [
    '', 'STOCK', 'SECTOR', '#', 'QTY',
    isExited ? 'LAST PRICE' : 'CMP ✎',
    'INVESTED', 'INV. PRICE', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD', '',
  ];

  return (
    <div className={`fade-up ${styles.wrapper}`}>

      <HoldingsSummaryRefreshBar
        items={summaryItems}
        onRefresh={() => refreshPrices('STOCK')}
        refreshing={isRefreshing}
        title={isRefreshing ? 'Refresh in progress…' : 'Refresh stock prices from Yahoo Finance'}
        label="Refresh Prices"
        accentColor="rgba(139,92,246,0.06)"
        accentBorder="rgba(139,92,246,0.3)"
        textColor="var(--purple)"
        minWidth={88}
        tableStyles={styles}
        formatValue={value => typeof value === 'string' ? value : fmtCr(value)}
      />

      {/* Equity Stock Allocation Donut Chart */}
      {!isExited && stockAllocationData.length > 0 && (
        <div className="glass" style={{ padding: '16px 20px', borderRadius: 10 }}>
          <div style={{
            fontSize: '12px',
            fontWeight: '700',
            color: 'var(--text)',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            letterSpacing: '0.02em',
          }}>
            <span>📊</span> Stock Allocation Breakdown (% of Equity Portfolio)
          </div>
          <AllocationDonutChart
            data={stockAllocationData}
            size={240}
            centerLabel={`${stockAllocationData.length}`}
            centerSub="STOCKS"
            maxLegendHeight={260}
            legendGrid={true}
          />
        </div>
      )}

      {/* Data error banner if any */}
      {dataErrorCount > 0 && (
        <div className={styles.dataErrorBanner}>
          ⚠ {dataErrorCount} stock{dataErrorCount > 1 ? 's have' : ' has'} FIFO mismatches — some sell trades have no matching buys. Expand those rows for details.
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
            Click row to expand full FIFO sell history, cost analysis, and realized P&amp;L breakdown
          </>
        ) : (
          <>
            <span className={styles.editHintAccent}>✎</span>
            Click edit icon next to CMP to update price · Click row to expand lot details, cost analysis + sell history ·
            <span className={styles.editHintTeal}>↺</span>
            Click refresh icon to fetch live price ·
            <span className={styles.concentrationHint}>% badge = stock concentration in equity portfolio</span>
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
          highlightEditable
        />

        {rows.length === 0 ? (
          <div className={styles.tableEmpty}>
            {isExited ? 'No fully exited positions yet.' : 'No stocks match the selected filter.'}
          </div>
        ) : rows.map(h => {
          const open = !!expanded[h.symbol];
          const concentration = concentrationMap[h.symbol] ?? 0;
          const daysSinceBuy = daysSinceLastBuyMap[h.symbol];

          return (
            <div key={h.symbol} className={styles.rowOuter}>
              <div
                className={[
                  styles.dataRow,
                  open ? styles.dataRowExpanded : '',
                  isExited ? styles.dataRowExited : '',
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
                    {h.hasDataError && <DataErrorBadge qty={h.unmatchedSellQty} />}
                    {!isExited && <ConcentrationBadge pct={concentration} />}
                  </div>
                  <div className={styles.symbolMeta}>
                    {h.sells?.length > 0 && (
                      <span className={styles.sellBadge}>
                        {h.sells.length} sell{h.sells.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {!isExited && daysSinceBuy != null && daysSinceBuy > 90 && (
                      <span
                        className={styles.staleBuyBadge}
                        style={{ color: daysSinceBuy > 180 ? 'var(--yellow)' : 'var(--text3)' }}
                        title={`Last buy was ${daysSinceBuy} days ago`}
                      >
                        {daysSinceBuy > 365
                          ? `last buy ${Math.floor(daysSinceBuy / 365)}y ago`
                          : `last buy ${Math.floor(daysSinceBuy / 30)}mo ago`
                        }
                      </span>
                    )}
                  </div>
                </div>

                {/* Sector */}
                <div className={styles.sectorCell}>
                  <HoldingCategoryBadge label={h.sector || 'Other'} isExited={isExited} tableStyles={styles} />
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

                <HoldingMetricCells h={h} isExited={isExited} maxRet={maxRet} tableStyles={styles} />

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
                  assetType="STOCK"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
