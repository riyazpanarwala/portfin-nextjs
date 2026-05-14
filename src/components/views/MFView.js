'use client';

import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import { pct, pcol, holdStr, ReturnBar, HoldingDetailPanel, HoldingsEmpty, HoldingsControls } from '@/components/views/HoldingsShared';
import { useMFView } from '@/hooks/useMFView';
import styles from './HoldingsTable.module.css';

const COL = '20px 1fr 80px 32px 72px 72px 80px 80px 80px 88px 64px 130px 50px';

function HeaderRow() {
  const cols = ['', 'FUND NAME', 'CAT', '#', 'UNITS', 'CMP', 'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD'];
  return (
    <div className={styles.headerRow} style={{ display: 'grid', gridTemplateColumns: COL }}>
      {cols.map((c, i) => (
        <div
          key={i}
          className={`${styles.headerCell} ${i === 8 ? styles.headerCellYellow : ''}`}
          style={{ textAlign: i > 2 ? 'right' : 'left' }}
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
    categories, rows, maxRet, mfGain, mfRealized,
    summaryItems, toggleSort, toggleExpanded, exportCSV,
  } = useMFView({ mfHoldings, stats });

  if (!mfHoldings.length) return (
    <HoldingsEmpty icon="◎" label="No mutual funds yet" cta="+ Add MF Trade" onCta={() => setActiveView('trade')} />
  );

  return (
    <div className={`fade-up ${styles.wrapper}`}>

      {/* Summary strip
          FIX (Issue 8): each summaryItem now carries a `fmt` function so the
          render loop never has to guess the type of `m.v`.  Previously the
          component used `typeof m.v === 'number' && m.l !== 'Funds'` as a
          guard, but any label change would silently break it and pass a plain
          integer (e.g. fund count = 5) into fmtCr(), producing "₹5". */}
      <div className={styles.summaryStrip}>
        {summaryItems.map((m, i) => (
          <div key={i} className={styles.summaryCell}>
            <div className={styles.summaryCellLabel}>{m.l}</div>
            <div className={styles.summaryCellValue} style={{ color: m.c, fontSize: 18 }}>
              {/* Each item carries its own formatter — no type-sniffing needed */}
              {m.format ? m.format(m.v) : m.v}
            </div>
          </div>
        ))}
      </div>

      <HoldingsControls
        groupLabel="CATEGORY"
        groups={categories}
        activeGroup={category}
        onGroupChange={setCategory}
        sort={sort}
        onSortToggle={toggleSort}
        onExport={() => exportCSV(fmt)}
      />

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

                {/* Fund name */}
                <div className={styles.symbolCell}>
                  <div className={styles.symbolText} title={h.name || h.symbol}>{h.symbol}</div>
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
                      color: sectorColor(h.sector || 'Other'),
                      border: `1px solid ${sectorColor(h.sector || 'Other')}40`,
                    }}
                  >
                    {h.sector || 'Other'}
                  </span>
                </div>

                <div className={styles.monoCell}>{h.lots.length}</div>
                <div className={styles.monoCell}>{fmt(h.qty, 2)}</div>
                <div className={styles.cmpCell}>₹{fmt(h.cmp, 1)}</div>
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

        {rows.length === 0 && (
          <div className={styles.tableEmpty}>No funds match the selected filter.</div>
        )}
      </div>
    </div>
  );
}
