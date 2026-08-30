'use client';

import { useMemo, useState, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { colorPnl, fmtCr, fmt, sectorColor } from '@/lib/store';
import { xirr, holdingXIRR, lotXIRR } from '@/lib/xirr';
import { HoldingPerformanceChart } from '@/components/charts/Charts';
import { usePortfolio } from '@/context/PortfolioContext';
import { EmptyState } from '@/components/ui/SharedUI';
import styles from './HoldingsShared.module.css';

// ── Public XIRR wrappers (backward-compat) ────────────────────────────────────
export const computeXIRR     = xirr;
export const calcHoldingXIRR = holdingXIRR;
export const calcLotXIRR     = lotXIRR;

// Re-export EmptyState under old name
export { EmptyState as HoldingsEmpty };

// ── Formatters ────────────────────────────────────────────────────────────────
export function holdStr(days) {
  const d = Math.max(0, days);
  const y = Math.floor(d / 365), m = Math.floor((d % 365) / 30);
  return y > 0 ? (m > 0 ? `${y}y ${m}m` : `${y}y`) : `${m}m`;
}
export const pct  = (v, d = 2) => `${v > 0 ? '+' : ''}${fmt(v, d)}%`;
export const pcol = v => v >= 0 ? 'var(--green2)' : 'var(--red2)';

// ── Sort options ──────────────────────────────────────────────────────────────
export const SORTS = [
  { key: 'returnPct',      label: 'Return'     },
  { key: 'cagr',           label: 'CAGR'       },
  { key: 'marketValue',    label: 'Value'      },
  { key: 'unrealizedGain', label: 'Unrealized' },
  { key: 'realizedGain',   label: 'Realized'   },
  { key: 'invested',       label: 'Invested'   },
  { key: 'lots',           label: 'Lots'       },
];

const COLUMN_SORT_KEYS = {
  'STOCK': 'symbol',
  'FUND NAME': 'name',
  'SECTOR': 'sector',
  'CAT': 'sector',
  '#': 'lots',
  'QTY': 'qty',
  'UNITS': 'qty',
  'CMP ✎': 'cmp',
  'CMP': 'cmp',
  'LAST PRICE': 'cmp',
  'LAST NAV': 'cmp',
  'INVESTED': 'invested',
  'INV. PRICE': 'avgBuy',
  'VALUE': 'marketValue',
  'REALIZED': 'realizedGain',
  'GAIN': 'unrealizedGain',
  'CAGR': 'cagr',
  'RETURN %': 'returnPct',
  'HOLD': 'holdingDays',
};

export function HoldingsHeaderRow({
  columns,
  gridTemplateColumns,
  isExited,
  tableStyles,
  highlightEditable = false,
  sort,
  onSortToggle,
}) {
  return (
    <div className={tableStyles.headerRow} style={{ display: 'grid', gridTemplateColumns }}>
      {columns.map((column, index) => {
        const cleanName = column.replace(/[✎]/g, '').trim();
        const sortKey = COLUMN_SORT_KEYS[column] || COLUMN_SORT_KEYS[cleanName];
        const isSortable = !!sortKey && !!onSortToggle;
        const isActiveSort = sort && (sort.key === sortKey || (sortKey === 'unrealizedGain' && (sort.key === 'unrealizedGain' || sort.key === 'gain')));

        return (
          <div
            key={index}
            onClick={isSortable ? () => onSortToggle(sortKey) : undefined}
            title={isSortable ? `Sort by ${cleanName}` : undefined}
            className={[
              tableStyles.headerCell,
              isSortable ? tableStyles.headerCellSortable : '',
              isActiveSort ? tableStyles.headerCellActiveSort : '',
              highlightEditable && index === 5 && !isExited ? tableStyles.headerCellHighlight : '',
              index === 9 ? tableStyles.headerCellYellow : '',
            ].filter(Boolean).join(' ')}
            style={{
              textAlign: index > 2 && index < columns.length - 1 ? 'right' : 'left',
              cursor: isSortable ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            {column}
            {isActiveSort && (
              <span style={{ marginLeft: 3, fontSize: 8, color: 'var(--accent2)' }}>
                {sort.dir === 1 ? '▲' : '▼'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HoldingsSummaryRefreshBar({
  items,
  onRefresh,
  refreshing,
  title,
  label,
  refreshingLabel = 'Updatingâ€¦',
  accentColor,
  accentBorder,
  textColor,
  minWidth,
  tableStyles,
  valueSize = 17,
  formatValue = value => value,
}) {
  return (
    <div className={tableStyles.summaryRefreshBar}>
      <div className={tableStyles.summaryStrip} style={{ flex: 1 }}>
        {items.map((item, index) => (
          <div key={index} className={tableStyles.summaryCell}>
            <div className={tableStyles.summaryCellLabel}>{item.l}</div>
            <div className={tableStyles.summaryCellValue} style={{ color: item.c, fontSize: valueSize }}>
              {item.format ? item.format(item.v) : formatValue(item.v)}
            </div>
            {item.sub && <div className={tableStyles.summaryCellSub}>{item.sub}</div>}
          </div>
        ))}
      </div>

      <button
        onClick={refreshing ? undefined : onRefresh}
        disabled={refreshing}
        title={title}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '12px 18px',
          background: refreshing ? 'var(--bg3)' : accentColor,
          border: `1px solid ${refreshing ? 'var(--border)' : accentBorder}`,
          borderRadius: 10,
          cursor: refreshing ? 'not-allowed' : 'pointer',
          opacity: refreshing ? 0.55 : 1,
          color: textColor,
          minWidth,
          flexShrink: 0,
          transition: 'all 0.2s',
        }}
      >
        <RefreshCw
          size={16}
          style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined}
        />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {refreshing ? refreshingLabel : label}
        </span>
      </button>
    </div>
  );
}

export function HoldingCategoryBadge({ label, isExited, tableStyles }) {
  return (
    <span
      className={[
        tableStyles.sectorBadge,
        isExited ? tableStyles.sectorBadgeExited : '',
      ].filter(Boolean).join(' ')}
      style={{
        background: `${sectorColor(label || 'Other')}20`,
        color: sectorColor(label || 'Other'),
        border: `1px solid ${sectorColor(label || 'Other')}40`,
      }}
    >
      {label || 'Other'}
    </span>
  );
}

export function HoldingMetricCells({ h, isExited, maxRet, tableStyles }) {
  const hasRealized = (h.realizedGain || 0) !== 0;
  const rupee = '\u20b9';
  const dash = '\u2014';
  return (
    <>
      <div className={tableStyles.monoCell}>{fmtCr(h.invested)}</div>
      <div className={tableStyles.monoCell}>
        {h.qty > 0 ? `${rupee}${fmt(h.invested / h.qty, 2)}` : dash}
      </div>
      <div className={[
        tableStyles.monoCellBold,
        isExited ? tableStyles.monoCellMuted : '',
      ].filter(Boolean).join(' ')}>
        {isExited ? dash : fmtCr(h.marketValue)}
      </div>
      <div
        className={`${tableStyles.monoCell} ${tableStyles.monoCellRealized}`}
        style={{ color: hasRealized ? colorPnl(h.realizedGain) : 'var(--text3)' }}
      >
        {hasRealized ? fmtCr(h.realizedGain) : dash}
      </div>
      <div
        className={`${tableStyles.monoCell} ${tableStyles.monoCellGain}`}
        style={{ color: colorPnl(isExited ? h.realizedGain : h.unrealizedGain) }}
      >
        {fmtCr(isExited ? h.realizedGain : h.unrealizedGain)}
      </div>
      <div
        className={`${tableStyles.monoCell} ${tableStyles.monoCellCagr}`}
        style={{ color: pcol(h.cagr) }}
      >
        {pct(h.cagr)}
      </div>
      <div className={tableStyles.returnBarCell}>
        <ReturnBar val={h.returnPct} max={maxRet} />
      </div>
      <div className={tableStyles.holdCell}>{holdStr(h.holdingDays)}</div>
    </>
  );
}

// ── ModeToggle — Active / Exited segment control ──────────────────────────────
export function ModeToggle({ mode, setMode, activeCount, exitedCount }) {
  const tabs = [
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'exited', label: 'Exited', count: exitedCount },
  ];
  return (
    <div className={styles.modeToggleRow}>
      {tabs.map(t => {
        const on = mode === t.key;
        const modifier = on
          ? (t.key === 'active' ? styles.modeBtnActive : styles.modeBtnExited)
          : '';
        return (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`${styles.modeBtn} ${modifier}`}
          >
            {t.label}
            <span className={styles.modeBtnCount}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── ExitedBanner ──────────────────────────────────────────────────────────────
export function ExitedBanner({ message }) {
  return (
    <div className={styles.exitedBanner}>
      <span>📋</span>
      {message}
    </div>
  );
}

// ── DataErrorBadge — warns about FIFO mismatch ───────────────────────────────
export function DataErrorBadge({ qty }) {
  return (
    <span
      title={`FIFO mismatch: ${fmt(qty, 4)} units sold have no matching buy lots. Realized gain may be understated.`}
      className={styles.dataErrorBadge}
    >
      ⚠ data
    </span>
  );
}

// ── ConcentrationBadge — flags high single-stock weight ──────────────────────
export function ConcentrationBadge({ pct: weight }) {
  if (weight < 15) return null;
  const level = weight >= 25 ? 'high' : 'warn';
  return (
    <span
      title={`${fmt(weight, 1)}% of stock portfolio — ${level === 'high' ? 'very high' : 'elevated'} concentration`}
      className={`${styles.concentrationBadge} ${level === 'high' ? styles.concentrationHigh : styles.concentrationWarn}`}
    >
      {fmt(weight, 0)}%
    </span>
  );
}

// ── ReturnBar ─────────────────────────────────────────────────────────────────
export function ReturnBar({ val, max }) {
  const w = Math.min(100, (Math.abs(val) / (max || 1)) * 100);
  return (
    <div className={styles.returnBarWrapper}>
      <div className={styles.returnBarTrack}>
        <div className={styles.returnBarFill} style={{ width: w + '%', background: pcol(val) }} />
      </div>
      <span className={styles.returnBarValue} style={{ color: pcol(val) }}>{pct(val)}</span>
    </div>
  );
}

// ── TaxBadge ──────────────────────────────────────────────────────────────────
export function TaxBadge({ days }) {
  const ltcg = days >= 365;
  return (
    <span
      className={styles.taxBadge}
      style={{
        background: ltcg ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
        color:      ltcg ? 'var(--green2)'          : 'var(--yellow)',
        border:     `1px solid ${ltcg ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
      }}
    >
      {ltcg ? 'LTCG' : 'STCG'}
    </span>
  );
}

// ── Table cell helpers ────────────────────────────────────────────────────────
export function TH({ ch, right }) {
  return (
    <th className={`${styles.th} ${right ? styles.thRight : ''}`}>{ch}</th>
  );
}

export function TD({ ch, right, mono, color, bold, small, className = '' }) {
  return (
    <td
      className={[
        styles.td,
        right ? styles.tdRight : '',
        mono  ? styles.tdMono  : '',
        bold  ? styles.tdBold  : '',
        small ? styles.tdSmall : '',
        mono  ? 'mono-privacy' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ color: color || 'var(--text)' }}
    >
      {ch}
    </td>
  );
}

// ── RefreshPriceButton ────────────────────────────────────────────────────────
export function RefreshPriceButton({ symbol, assetType, onRefreshed }) {
  const { updatePrice, toast } = usePortfolio();
  const [loading, setLoading] = useState(false);

  async function handleRefresh(e) {
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol], force: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newPrice =
        data.prices?.[symbol] ??
        data.prices?.[symbol.toUpperCase()] ??
        null;
      if (newPrice && newPrice > 0) {
        await updatePrice(symbol, newPrice);
        onRefreshed && onRefreshed(newPrice);
      } else {
        toast(`No live price found for ${symbol}`, 'blue');
      }
    } catch (err) {
      toast(`Price refresh failed for ${symbol}: ${err.message}`, 'red');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      title={`Refresh live ${assetType === 'MF' ? 'NAV' : 'price'} for ${symbol}`}
      className={styles.refreshPriceBtn}
      style={{ opacity: loading ? 0.55 : 1 }}
    >
      {loading ? (
        <svg
          width="10" height="10" viewBox="0 0 24 24"
          style={{ animation: 'spin 0.7s linear infinite', display: 'block' }}
        >
          <circle
            cx="12" cy="12" r="10"
            fill="none" stroke="currentColor"
            strokeWidth="2.8" strokeDasharray="32"
            strokeDashoffset="10" strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ display: 'block' }}
        >
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      )}
    </button>
  );
}

// ── Inline CMP price editor ───────────────────────────────────────────────────
export function PriceCell({ symbol, cmp, onSaved }) {
  const { updatePrice } = usePortfolio();
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState('');
  const [saving, setSaving]   = useState(false);
  const inputRef              = useRef(null);
  const savingRef             = useRef(false);

  function startEdit(e) {
    e.stopPropagation();
    setVal(fmt(cmp, 2));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }

  async function save(e) {
    e?.stopPropagation();
    if (savingRef.current) return;
    const price = parseFloat(val);
    if (!price || price <= 0) { setEditing(false); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await updatePrice(symbol, price);
      onSaved?.(price);
    } finally {
      setSaving(false);
      setEditing(false);
      savingRef.current = false;
    }
  }

  function handleBlur(e) {
    // Only save on blur if focus didn't move to the save button
    if (!e.relatedTarget?.closest?.('button')) {
      save(e);
    }
  }

  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter')  save(e);
    if (e.key === 'Escape') setEditing(false);
  }

  if (editing) {
    return (
      <div className={styles.priceCellEditWrapper} onClick={e => e.stopPropagation()}>
        <span className={styles.priceCellCurrencySymbol}>₹</span>
        <input
          ref={inputRef}
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={onKey}
          onBlur={handleBlur}
          className={styles.priceCellInput}
        />
        <button onClick={save} disabled={saving} className={styles.priceCellSaveBtn}>
          {saving ? '…' : '✓'}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.priceCellWrapper}>
      <span className={styles.priceCellValue}>₹{fmt(cmp, 2)}</span>
      <button onClick={startEdit} title={`Edit CMP for ${symbol}`} className={styles.priceCellEditBtn}>
        ✎
      </button>
    </div>
  );
}

// ── Shared controls bar ───────────────────────────────────────────────────────
export function HoldingsControls({
  groupLabel,
  groups,
  activeGroup,
  onGroupChange,
  sort,
  onSortToggle,
  extra,
  onExport,
  onToggleExpandAll,
  allExpanded,
}) {
  return (
    <div className={styles.controlsBar}>
      <div className={styles.controlsGroupPills}>
        <span className={styles.controlsGroupLabel}>{groupLabel}</span>
        {groups.map(g => (
          <button
            key={g}
            onClick={() => onGroupChange(g)}
            className={styles.groupPillBtn}
            style={{
              border:     activeGroup === g ? `1px solid ${g === 'All' ? 'var(--accent)' : sectorColor(g)}` : '1px solid var(--border)',
              background: activeGroup === g ? (g === 'All' ? 'var(--accent)' : sectorColor(g) + '33') : 'var(--bg3)',
              color:      activeGroup === g ? (g === 'All' ? '#fff' : sectorColor(g)) : 'var(--text2)',
            }}
          >
            {g}
          </button>
        ))}
      </div>

      <div className={styles.sortArea}>
        {extra}
        <span className={styles.controlsGroupLabel}>SORT</span>
        {SORTS.map(s => (
          <button
            key={s.key}
            onClick={() => onSortToggle(s.key)}
            className={styles.sortPillBtn}
            style={{
              border:     `1px solid ${sort.key === s.key ? 'var(--accent)' : 'var(--border)'}`,
              background: sort.key === s.key ? 'rgba(59,130,246,0.12)' : 'transparent',
              color:      sort.key === s.key ? 'var(--accent2)' : 'var(--text3)',
            }}
          >
            {s.label}{sort.key === s.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
        {onToggleExpandAll && (
          <button
            onClick={onToggleExpandAll}
            className="btn btn-ghost"
            style={{ padding: '3px 9px', fontSize: 11, color: 'var(--text2)', border: '1px solid var(--border)' }}
            title={allExpanded ? 'Collapse all holding rows' : 'Expand all holding rows'}
          >
            {allExpanded ? 'Collapse All ▲' : 'Expand All ▼'}
          </button>
        )}
        <button onClick={onExport} className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11 }}>↓ CSV</button>
      </div>
    </div>
  );
}

// ── Lot table ─────────────────────────────────────────────────────────────────
export function LotTable({ lots, cmp, qtyDecimals = 0 }) {
  const rows = useMemo(
    () => [...lots].sort((a, b) => b.date.localeCompare(a.date)),
    [lots],
  );

  return (
    <>
      <div className={styles.tableScrollWrapper}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <TH ch="BUY DATE" />
              <TH ch={qtyDecimals > 0 ? 'BUY NAV' : 'BUY PRICE'} right />
              <TH ch={qtyDecimals > 0 ? 'UNITS' : 'QTY'} right />
              <TH ch="INVESTED" right />
              <TH ch="GAIN" right />
              <TH ch="RETURN" right />
              <TH ch="XIRR" right />
              <TH ch="HOLD" right />
              <TH ch="TAX" />
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              const inv  = l.qty * l.price;
              const gain = l.qty * cmp - inv;
              const ret  = inv > 0 ? gain / inv * 100 : 0;
              const days = Math.round((new Date() - new Date(l.date)) / 864e5);
              const xi   = calcLotXIRR(l, cmp);
              return (
                <tr key={i}>
                  <TD ch={l.date} mono color="var(--text2)" />
                  <TD ch={`₹${fmt(l.price, 2)}`} right mono />
                  <TD ch={fmt(l.qty, qtyDecimals)} right mono />
                  <TD ch={`₹${fmt(inv, 0)}`} right mono />
                  <TD ch={`₹${fmt(gain, 0)}`} right mono color={colorPnl(gain)} bold />
                  <TD ch={pct(ret)} right mono color={pcol(ret)} />
                  <TD ch={xi != null ? pct(xi) : '—'} right mono color="var(--accent2)" />
                  <TD ch={holdStr(days)} right mono color="var(--text2)" />
                  <TD ch={<TaxBadge days={days} />} />
                </tr>
              );
            })}
            <tr className={styles.totalRow}>
              <td colSpan={2} className={styles.td} style={{ fontSize: 10, color: 'var(--text3)' }}>
                TOTAL · {lots.length} LOTS
              </td>
              <TD ch={fmt(lots.reduce((s, l) => s + l.qty, 0), qtyDecimals)} right mono bold />
              <TD ch={`₹${fmt(lots.reduce((s, l) => s + l.qty * l.price, 0), 0)}`} right mono bold />
              <TD
                ch={fmtCr(lots.reduce((s, l) => s + (l.qty * cmp - l.qty * l.price), 0))}
                right mono bold
                color={colorPnl(lots.reduce((s, l) => s + (l.qty * cmp - l.qty * l.price), 0))}
              />
              <TD
                ch={pct((() => {
                  const inv = lots.reduce((s, l) => s + l.qty * l.price, 0);
                  const val = lots.reduce((s, l) => s + l.qty * cmp, 0);
                  return inv > 0 ? (val - inv) / inv * 100 : 0;
                })())}
                right mono bold
                color={pcol(lots.reduce((s, l) => s + (l.qty * cmp - l.qty * l.price), 0))}
              />
              <TD ch="← XIRR above" right small color="var(--text3)" />
              <TD ch="" />
              <TD ch="" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.tableNote}>
        XIRR = money-weighted return — accounts for exact timing of each purchase.
      </div>
    </>
  );
}

// ── Monthly breakdown table ───────────────────────────────────────────────────
export function MonthlyTable({ lots, cmp, qtyDecimals = 0 }) {
  const monthly = useMemo(() => {
    const map = {};
    lots.forEach(l => {
      const k = l.date.slice(0, 7);
      if (!map[k]) map[k] = { month: k, qty: 0, inv: 0, lots: 0 };
      map[k].qty += l.qty;
      map[k].inv += l.qty * l.price;
      map[k].lots += 1;
    });
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        avgPrice: m.qty > 0 ? m.inv / m.qty : 0,
        val:  m.qty * cmp,
        gain: m.qty * cmp - m.inv,
        ret:  m.inv > 0 ? (m.qty * cmp - m.inv) / m.inv * 100 : 0,
      }));
  }, [lots, cmp]);

  const qtyLabel   = qtyDecimals > 0 ? 'UNITS'     : 'QTY';
  const maxInvested = Math.max(...monthly.map(m => m.inv), 1);
  const yearSummary = useMemo(() => {
    const map = {};
    monthly.forEach(m => {
      const year = m.month.slice(0, 4);
      if (!map[year]) map[year] = { year, inv: 0, qty: 0, lots: 0 };
      map[year].inv += m.inv;
      map[year].qty += m.qty;
      map[year].lots += m.lots;
    });
    return Object.values(map).map(y => {
      const gain = y.qty * cmp - y.inv;
      return {
        ...y,
        gain,
        ret: y.inv > 0 ? gain / y.inv * 100 : 0,
      };
    });
  }, [monthly, cmp]);

  const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' });

  return (
    <>
      <div className={styles.monthlyYearTitle}>Year-wise summary</div>
      <div className={styles.monthlyYearGrid}>
        {yearSummary.map(y => (
          <div key={y.year} className={styles.monthlyYearCard}>
            <div className={styles.monthlyYearLabel}>{y.year}</div>
            <div className={`${styles.monthlyYearValue} mono-privacy`}>{fmtCr(y.inv)}</div>
            <div className={`${styles.monthlyYearMeta} mono-privacy`} style={{ color: pcol(y.ret) }}>
              {pct(y.ret, 1)} · {fmt(y.lots, 0)} lots
            </div>
          </div>
        ))}
      </div>

      <div className={styles.tableScrollWrapper}>
        <table className={styles.monthlyBreakupTable}>
          <thead>
            <tr>
              <TH ch="MONTH" />
              <TH ch="INVESTED (WITH BAR)" />
              <TH ch={qtyLabel} right />
              <TH ch="GAIN / LOSS" right />
              <TH ch="RETURN %" right />
              <TH ch="LOTS" right />
            </tr>
          </thead>
          <tbody>
            {monthly.map(m => {
              const barWidth = `${Math.max(1, (m.inv / maxInvested) * 100)}%`;
              const monthDate = new Date(`${m.month}-01T00:00:00`);
              return (
                <tr key={m.month} className={styles.monthlyBreakupRow}>
                  <TD ch={monthFormatter.format(monthDate)} mono bold />
                  <td className={`${styles.td} ${styles.monthlyInvestedCell}`}>
                    <div className={styles.monthlyInvestedTrack}>
                      <div className={styles.monthlyInvestedBar} style={{ width: barWidth }} />
                    </div>
                    <span className={`${styles.monthlyInvestedValue} mono-privacy`}>₹{fmt(m.inv, 2)}</span>
                  </td>
                  <TD ch={fmt(m.qty, qtyDecimals)} right mono color="var(--text2)" />
                  <TD ch={`₹${fmt(m.gain, 2)}`} right mono color={colorPnl(m.gain)} />
                  <TD ch={pct(m.ret)} right mono color={pcol(m.ret)} />
                  <TD ch={fmt(m.lots, 0)} right mono color="var(--text2)" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Sell history table ────────────────────────────────────────────────────────
export function SellHistoryTable({ h, qtyDecimals = 0 }) {
  const { sells, stats } = h;
  if (!sells || !sells.length) return null;

  const rows = [...sells].sort((a, b) => b.date.localeCompare(a.date));

  function TaxChip({ type }) {
    return (
      <span
        className={styles.taxBadge}
        style={{
          background: type === 'LTCG' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
          color:      type === 'LTCG' ? 'var(--green2)' : 'var(--yellow)',
          border:     `1px solid ${type === 'LTCG' ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
        }}
      >
        {type}
      </span>
    );
  }

  const priceLabel = qtyDecimals > 0 ? 'SELL NAV'  : 'SELL PRICE';
  const qtyLabel   = qtyDecimals > 0 ? 'UNITS'     : 'QTY';

  return (
    <>
      <div className={styles.tableScrollWrapper}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
          <thead>
            <tr>
              <TH ch="SELL DATE" />
              <TH ch={priceLabel} right />
              <TH ch={qtyLabel} right />
              <TH ch="PROCEEDS" right />
              <TH ch="REALIZED" right />
              <TH ch="TAX TYPE" />
              <TH ch="FIFO LOTS MATCHED" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={i}>
                <TD ch={s.date} mono color="var(--text2)" />
                <TD ch={`₹${fmt(s.sellPrice, 2)}`} right mono />
                <TD ch={fmt(s.qty, qtyDecimals)} right mono />
                <TD ch={fmtCr(s.qty * s.sellPrice)} right mono />
                <TD ch={fmtCr(s.realized)} right mono color={colorPnl(s.realized)} bold />
                <TD ch={<TaxChip type={s.taxType} />} />
                <TD ch={
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {s.matchedLots.map((ml, mi) => (
                      <span key={mi} style={{
                        fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)',
                        background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3,
                        border: '1px solid var(--border)',
                      }}>
                        {fmt(ml.qty, qtyDecimals)}@{fmt(ml.buyPrice, qtyDecimals > 0 ? 2 : 0)} ({ml.holdDays}d)
                      </span>
                    ))}
                  </div>
                } />
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td colSpan={3} className={styles.td} style={{ fontSize: 10, color: 'var(--text3)' }}>
                TOTAL · {sells.length} SELL(S)
              </td>
              <TD ch={fmtCr(stats.totalSellProceeds)} right mono bold />
              <TD ch={fmtCr(h.realizedGain)} right mono color={colorPnl(h.realizedGain)} bold />
              <TD ch="" />
              <TD ch="" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.fifoNote}>
        FIFO matching — oldest {qtyDecimals > 0 ? 'units redeemed' : 'lots consumed'} first.
        Hold days per matched lot determines LTCG/STCG.
      </div>
    </>
  );
}

// ── SIP Consistency panel (MF-specific) ───────────────────────────────────────
export function SIPConsistencyPanel({ lots }) {
  const { monthsInvested, totalMonths, consistency, avgMonthlyInvestment, lastBuyDate, daysSinceLastBuy } = useMemo(() => {
    if (!lots || !lots.length) return { monthsInvested: 0, totalMonths: 0, consistency: 0, avgMonthlyInvestment: 0, lastBuyDate: null, daysSinceLastBuy: 0 };

    const sortedDates = [...lots].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = new Date(sortedDates[0].date);
    const lastDate  = new Date(sortedDates[sortedDates.length - 1].date);

    const months = new Set(lots.map(l => l.date.slice(0, 7)));
    const [fy, fm] = sortedDates[0].date.slice(0, 7).split('-').map(Number);
    const [ly, lm] = sortedDates[sortedDates.length - 1].date.slice(0, 7).split('-').map(Number);
    const totalMonths = Math.max(1, (ly - fy) * 12 + (lm - fm) + 1);
    const monthsInvested = months.size;
    const consistency = Math.round((monthsInvested / totalMonths) * 100);
    const totalInv = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const avgMonthlyInvestment = totalInv / monthsInvested;
    const daysSinceLastBuy = Math.round((new Date() - lastDate) / 864e5);

    return { monthsInvested, totalMonths, consistency, avgMonthlyInvestment, lastBuyDate: sortedDates[sortedDates.length - 1].date, daysSinceLastBuy };
  }, [lots]);

  const consistencyColor = consistency >= 80 ? 'var(--green2)' : consistency >= 50 ? 'var(--yellow)' : 'var(--red2)';
  const consistencyLabel = consistency >= 80 ? 'Consistent' : consistency >= 50 ? 'Irregular' : 'Sporadic';
  const lastBuyColor = daysSinceLastBuy > 60 ? 'var(--yellow)' : 'var(--text3)';

  return (
    <div className={styles.sipPanel}>
      <div className={styles.sipPanelTitle}>SIP Consistency</div>
      <div className={styles.sipGrid}>
        <div className={styles.sipStat}>
          <div className={styles.sipStatLabel}>Months invested</div>
          <div className={`${styles.sipStatValue} mono-privacy`} style={{ color: 'var(--accent2)' }}>
            {monthsInvested} <span className={styles.sipStatOf}>/ {totalMonths}</span>
          </div>
        </div>
        <div className={styles.sipStat}>
          <div className={styles.sipStatLabel}>Consistency</div>
          <div className={`${styles.sipStatValue} mono-privacy`} style={{ color: consistencyColor }}>
            {consistency}% <span className={styles.sipStatOf}>({consistencyLabel})</span>
          </div>
        </div>
        <div className={styles.sipStat}>
          <div className={styles.sipStatLabel}>Avg monthly SIP</div>
          <div className={`${styles.sipStatValue} mono-privacy`} style={{ color: 'var(--text)' }}>
            {fmtCr(avgMonthlyInvestment)}
          </div>
        </div>
        <div className={styles.sipStat}>
          <div className={styles.sipStatLabel}>Last buy</div>
          <div className={`${styles.sipStatValue} mono-privacy`} style={{ color: lastBuyColor }}>
            {lastBuyDate} <span className={styles.sipStatOf}>({daysSinceLastBuy}d ago)</span>
          </div>
        </div>
      </div>
      <div className={styles.sipBar}>
        <div className={styles.sipBarTrack}>
          <div
            className={styles.sipBarFill}
            style={{ width: `${consistency}%`, background: consistencyColor }}
          />
        </div>
        <span className={`${styles.sipBarLabel} mono-privacy`} style={{ color: consistencyColor }}>{consistency}%</span>
      </div>
    </div>
  );
}

// ── Unrealized Tax panel (shared) ─────────────────────────────────────────────
export function UnrealizedTaxPanel({ h }) {
  const ltcgLots = h.lots.filter(l => {
    const days = Math.round((new Date() - new Date(l.date)) / 864e5);
    return days >= 365;
  });
  const stcgLots = h.lots.filter(l => {
    const days = Math.round((new Date() - new Date(l.date)) / 864e5);
    return days < 365;
  });

  const ltcgGain = ltcgLots.reduce((s, l) => s + l.qty * (h.cmp - l.price), 0);
  const stcgGain = stcgLots.reduce((s, l) => s + l.qty * (h.cmp - l.price), 0);

  const ltcgTax = Math.max(0, ltcgGain - 125000) * 0.125;
  const stcgTax = Math.max(0, stcgGain) * 0.20;
  const totalTax = ltcgTax + stcgTax;

  if (totalTax <= 0 && ltcgGain <= 0 && stcgGain <= 0) return null;

  return (
    <div className={styles.taxPanel}>
      <div className={styles.taxPanelTitle}>Unrealized Tax Exposure</div>
      <div className={styles.taxGrid}>
        {ltcgGain > 0 && (
          <div className={styles.taxStat}>
            <div className={styles.taxStatLabel}>LTCG gain</div>
            <div className={`${styles.taxStatValue} mono-privacy`} style={{ color: 'var(--green2)' }}>{fmtCr(ltcgGain)}</div>
            <div className={styles.taxStatSub}>12.5% · ₹1.25L exempt</div>
          </div>
        )}
        {stcgGain > 0 && (
          <div className={styles.taxStat}>
            <div className={styles.taxStatLabel}>STCG gain</div>
            <div className={`${styles.taxStatValue} mono-privacy`} style={{ color: 'var(--yellow)' }}>{fmtCr(stcgGain)}</div>
            <div className={styles.taxStatSub}>20% rate</div>
          </div>
        )}
        {totalTax > 0 && (
          <div className={styles.taxStat}>
            <div className={styles.taxStatLabel}>Est. tax if booked</div>
            <div className={`${styles.taxStatValue} mono-privacy`} style={{ color: 'var(--red2)' }}>{fmtCr(totalTax)}</div>
            <div className={styles.taxStatSub}>Approx. FY liability</div>
          </div>
        )}
        <div className={styles.taxStat}>
          <div className={styles.taxStatLabel}>LTCG lots</div>
          <div className={`${styles.taxStatValue} mono-privacy`} style={{ color: 'var(--text2)' }}>{ltcgLots.length}</div>
          <div className={styles.taxStatSub}>held ≥ 1yr</div>
        </div>
      </div>
    </div>
  );
}

// ── Cost Averaging Indicator (stocks-specific) ────────────────────────────────
export function CostAveragingPanel({ h }) {
  const { lots, avgBuy, cmp } = h;
  if (!lots || lots.length < 2) return null;

  const sortedLots = [...lots].sort((a, b) => a.date.localeCompare(b.date));
  const recentLot  = sortedLots[sortedLots.length - 1];
  const oldestLot  = sortedLots[0];
  const recentVsAvg = avgBuy > 0 ? ((recentLot.price - avgBuy) / avgBuy) * 100 : 0;
  const priceImproved = avgBuy > 0 ? recentLot.price < avgBuy : false; // recent buy below avg = cost-averaging down

  const daysSinceLastBuy = Math.round((new Date() - new Date(recentLot.date)) / 864e5);
  const lastBuyColor = daysSinceLastBuy > 180 ? 'var(--yellow)' : daysSinceLastBuy > 90 ? 'var(--text2)' : 'var(--green2)';

  return (
    <div className={styles.caPanel}>
      <div className={styles.caPanelTitle}>Cost Basis Analysis</div>
      <div className={styles.caGrid}>
        <div className={styles.caStat}>
          <div className={styles.caStatLabel}>Avg buy price</div>
          <div className={`${styles.caStatValue} mono-privacy`} style={{ color: 'var(--text)' }}>₹{fmt(avgBuy, 2)}</div>
        </div>
        <div className={styles.caStat}>
          <div className={styles.caStatLabel}>Last buy price</div>
          <div className={`${styles.caStatValue} mono-privacy`} style={{ color: priceImproved ? 'var(--green2)' : 'var(--yellow)' }}>
            ₹{fmt(recentLot.price, 2)}
          </div>
          <div className={styles.caStatSub} style={{ color: priceImproved ? 'var(--green2)' : 'var(--yellow)' }}>
            {priceImproved ? '▼ below avg (cost down)' : '▲ above avg (cost up)'}
          </div>
        </div>
        <div className={styles.caStat}>
          <div className={styles.caStatLabel}>Last buy vs avg</div>
          <div className={`${styles.caStatValue} mono-privacy`} style={{ color: pcol(recentVsAvg) }}>
            {pct(recentVsAvg)}
          </div>
        </div>
        <div className={styles.caStat}>
          <div className={styles.caStatLabel}>Days since last buy</div>
          <div className={`${styles.caStatValue} mono-privacy`} style={{ color: lastBuyColor }}>
            {daysSinceLastBuy}d
          </div>
          <div className={styles.caStatSub}>{recentLot.date}</div>
        </div>
        <div className={styles.caStat}>
          <div className={styles.caStatLabel}>Price range (lots)</div>
          <div className={`${styles.caStatValue} mono-privacy`} style={{ color: 'var(--text2)', fontSize: 13 }}>
            ₹{fmt(Math.min(...lots.map(l => l.price)), 0)} – ₹{fmt(Math.max(...lots.map(l => l.price)), 0)}
          </div>
        </div>
        <div className={styles.caStat}>
          <div className={styles.caStatLabel}>First purchase</div>
          <div className={`${styles.caStatValue} mono-privacy`} style={{ color: 'var(--text2)', fontSize: 13 }}>
            {oldestLot.date}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Holding detail panel shell ────────────────────────────────────────────────
export function HoldingDetailPanel({ h, priceMeta, chartLabel, qtyDecimals, xirrLabel, assetType }) {
  const { setActiveView } = usePortfolio();
  const [tab, setTab] = useState('lots');

  // Use a stable key derived from primitives to avoid re-computing on
  // every render when lots/sells are new array references.
  const xirrKey = `${h.symbol}:${h.cmp}:${h.lots?.length ?? 0}:${h.lots?.reduce((s, l) => s + l.qty, 0) ?? 0}:${h.sells?.length ?? 0}`;
  const xirrVal = useMemo(
    () => calcHoldingXIRR(h.lots, h.sells, h.cmp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xirrKey],
  );

  const meta     = priceMeta?.[h.symbol];
  const hasSells = h.sells && h.sells.length > 0;
  const isMF     = assetType === 'MF' || h.assetType === 'MF';
  const isStock  = !isMF;

  const tabs = [
    ['lots',    'Lot-wise breakup'],
    ['monthly', 'Monthly breakup'],
    ...(hasSells ? [['sells', `Sell History (${h.sells.length})`]] : []),
    ['insights', isMF ? 'SIP Insights' : 'Cost Analysis'],
  ];

  // Trade count breakdown
  const buyTrades  = h.stats?.buyTrades  ?? 0;
  const sellTrades = h.stats?.sellTrades ?? 0;
  const totalTrades = h.stats?.trades    ?? 0;

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailPanelInner}>

        <div className={styles.detailXirrBar}>
          <div className={styles.detailXirrText}>
            {xirrLabel}:{' '}
            <span className={styles.detailXirrValueLabel}>
              {xirrVal != null ? pct(xirrVal) : '—'}
            </span>{' '}
            <span className={styles.detailXirrUnit}>p.a.</span>
          </div>

          {/* Trade count chips */}
          <div className={styles.detailSellChips}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveView('trade');
              }}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid rgba(59,130,246,0.3)',
                background: 'rgba(59,130,246,0.1)',
                color: 'var(--accent2)',
                cursor: 'pointer',
              }}
              title={`Add buy or sell trade for ${h.symbol}`}
            >
              + Trade
            </button>
            <span className={styles.detailTradeChip}>
              {buyTrades}B / {sellTrades}S · {totalTrades} trades
            </span>
            {hasSells && (
              <>
                <span className={styles.detailSellChipWin}>✓ {h.stats.winCount} wins</span>
                <span className={styles.detailSellChipLoss}>✗ {h.stats.lossCount} losses</span>
                <span className={styles.detailSellChipRealized}>
                  Realized:{' '}
                  <span style={{ fontWeight: 700, color: colorPnl(h.realizedGain) }}>
                    {fmtCr(h.realizedGain)}
                  </span>
                </span>
              </>
            )}
            {/* Combined total gain chip */}
            {(h.realizedGain !== 0 || h.unrealizedGain !== 0) && (
              <span className={styles.detailTotalGainChip}>
                Total P&L:{' '}
                <span style={{ fontWeight: 700, color: colorPnl(h.totalGain) }}>
                  {fmtCr(h.totalGain)}
                </span>
              </span>
            )}
          </div>

          {/* Data error warning */}
          {h.hasDataError && (
            <span className={styles.detailDataError}>
              ⚠ FIFO mismatch: {fmt(h.unmatchedSellQty, 4)} units sold without matching buys — realized gain understated
            </span>
          )}

          {meta && (
            <span className={styles.detailPriceMeta}>
              Price: {meta.source}
              {meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleString('en-IN')}` : ''}
            </span>
          )}
        </div>

        <div className={styles.detailChartBox}>
          <div className={styles.detailChartLabel}>{chartLabel}</div>
          <HoldingPerformanceChart lots={h.lots} cmp={h.cmp} />
        </div>

        <div className={styles.detailTabBar}>
          {tabs.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`${styles.detailTabBtn} ${tab === k ? styles.detailTabBtnActive : ''}`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === 'lots'     && <LotTable lots={h.lots} cmp={h.cmp} qtyDecimals={qtyDecimals} />}
        {tab === 'monthly'  && <MonthlyTable lots={h.lots} cmp={h.cmp} qtyDecimals={qtyDecimals} />}
        {tab === 'sells'    && <SellHistoryTable h={h} qtyDecimals={qtyDecimals} />}
        {tab === 'insights' && (
          <div className={styles.insightsTab}>
            {isMF && <SIPConsistencyPanel lots={h.lots} />}
            {isStock && <CostAveragingPanel h={h} />}
            <UnrealizedTaxPanel h={h} />
          </div>
        )}
      </div>
    </div>
  );
}
