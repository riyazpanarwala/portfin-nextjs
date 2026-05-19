'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import {
  pct, pcol, holdStr,
  ReturnBar, PriceCell, HoldingDetailPanel,
  HoldingsEmpty, HoldingsControls,
  RefreshPriceButton,
} from '@/components/views/HoldingsShared';
import { useStocksView } from '@/hooks/useStocksView';
import styles from './HoldingsTable.module.css';

// Added a 28px column at the end for the refresh button
const COL = '20px 1fr 120px 32px 72px 110px 80px 80px 80px 88px 64px 130px 50px 28px';

function HeaderRow() {
  const cols = ['', 'STOCK', 'SECTOR', '#', 'QTY', 'CMP ✎', 'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD', ''];
  return (
    <div className={styles.headerRow} style={{ display: 'grid', gridTemplateColumns: COL }}>
      {cols.map((c, i) => (
        <div
          key={i}
          className={`${styles.headerCell} ${i === 5 ? styles.headerCellHighlight : ''} ${i === 8 ? styles.headerCellYellow : ''}`}
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
    sectors, rows, maxRet, stGain, stRealized,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  } = useStocksView({ stHoldings, stats });

  if (!stHoldings.length) return (
    <HoldingsEmpty icon="◐" label="No stock holdings yet" cta="+ Add Stock Trade" onCta={() => setActiveView('trade')} />
  );

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

      {/* Edit hint */}
      <div className={styles.editHint}>
        <span className={styles.editHintAccent}>✎</span>
        Click edit icon next to CMP to update price · Click row to expand lot details + sell history ·
        <span style={{ color: 'var(--teal)', marginLeft: 4 }}>↺</span>
        <span style={{ marginLeft: 3 }}>Click refresh icon to fetch live price</span>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        <HeaderRow />

        {rows.map(h => {
          const open        = !!expanded[h.symbol];
          const hasRealized = (h.realizedGain || 0) !== 0;
          return (
            <div key={h.symbol} style={{ borderBottom: '1px solid rgba(45,64,96,0.35)' }}>
              <div
                className={`${styles.dataRow} ${open ? styles.dataRowExpanded : ''}`}
                onClick={() => toggleExpanded(h.symbol)}
                style={{ display: 'grid', gridTemplateColumns: COL }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
              >
                <div className={styles.expandChevron}>{open ? '▼' : '►'}</div>

                {/* Symbol */}
                <div className={styles.symbolCell}>
                  <div className={styles.symbolText}>{h.symbol}</div>
                  {h.sells?.length > 0 && (
                    <div className={styles.sellBadge}>{h.sells.length} sell{h.sells.length > 1 ? 's' : ''}</div>
                  )}
                </div>

                {/* Sector */}
                <div className={styles.sectorCell}>
                  <span
                    className={styles.sectorBadge}
                    style={{
                      background: `${sectorColor(h.sector || 'Other')}20`,
                      color: sectorColor(h.sector || 'Other'),
                      border: `1px solid ${sectorColor(h.sector || 'Other')}40`,
                    }}
                  >
                    {h.sector || 'Other'}
                  </span>
                </div>

                <div className={styles.monoCell}>{h.lots.length}</div>
                <div className={styles.monoCell}>{fmt(h.qty, 0)}</div>

                {/* Editable CMP */}
                <div onClick={e => e.stopPropagation()}>
                  <PriceCell symbol={h.symbol} cmp={h.cmp} />
                </div>

                <div className={styles.monoCell}>{fmtCr(h.invested)}</div>
                <div className={styles.monoCellBold}>{fmtCr(h.marketValue)}</div>

                <div className={styles.monoCell} style={{ fontWeight: 600, color: hasRealized ? colorPnl(h.realizedGain) : 'var(--text3)' }}>
                  {hasRealized ? fmtCr(h.realizedGain) : '—'}
                </div>
                <div className={styles.monoCell} style={{ fontWeight: 600, color: colorPnl(h.unrealizedGain) }}>
                  {fmtCr(h.unrealizedGain)}
                </div>
                <div className={styles.monoCell} style={{ fontWeight: 700, color: pcol(h.cagr) }}>{pct(h.cagr)}</div>
                <div className={styles.returnBarCell}><ReturnBar val={h.returnPct} max={maxRet} /></div>
                <div className={styles.holdCell}>{holdStr(h.holdingDays)}</div>

                {/* Per-row live price refresh button */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}
                  onClick={e => e.stopPropagation()}
                >
                  <RefreshPriceButton symbol={h.symbol} assetType="STOCK" />
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

        {rows.length === 0 && (
          <div className={styles.tableEmpty}>No stocks match the selected filter.</div>
        )}
      </div>
    </div>
  );
}
