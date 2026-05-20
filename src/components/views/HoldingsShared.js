'use client';

import { useMemo, useState, useRef } from 'react';
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
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
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

// ── ModeToggle — Active / Exited segment control ──────────────────────────────
// Shared by StocksView and MFView.
// Uses classes from HoldingsShared.module.css (modeToggleRow, modeBtn,
// modeBtnActive, modeBtnExited, modeBtnCount).
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

// ── ExitedBanner — info strip shown when viewing exited positions ─────────────
// Uses .exitedBanner from HoldingsShared.module.css.
// Props:
//   message  string — context-specific wording (stocks vs MF)
export function ExitedBanner({ message }) {
  return (
    <div className={styles.exitedBanner}>
      <span>📋</span>
      {message}
    </div>
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

export function TD({ ch, right, mono, color, bold, small }) {
  return (
    <td
      className={[
        styles.td,
        right ? styles.tdRight : '',
        mono  ? styles.tdMono  : '',
        bold  ? styles.tdBold  : '',
        small ? styles.tdSmall : '',
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

  function startEdit(e) {
    e.stopPropagation();
    setVal(fmt(cmp, 2));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }

  async function save(e) {
    e.stopPropagation();
    const price = parseFloat(val);
    if (!price || price <= 0) { setEditing(false); return; }
    setSaving(true);
    await updatePrice(symbol, price);
    setSaving(false);
    setEditing(false);
    onSaved && onSaved(price);
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
          onBlur={save}
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
export function HoldingsControls({ groupLabel, groups, activeGroup, onGroupChange, sort, onSortToggle, extra, onExport }) {
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
        {extra}
        <button onClick={onExport} className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11 }}>↓ CSV</button>
      </div>
    </div>
  );
}

// ── Lot table ─────────────────────────────────────────────────────────────────
export function LotTable({ lots, cmp, qtyDecimals = 0 }) {
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
            {lots.map((l, i) => {
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
      if (!map[k]) map[k] = { month: k, qty: 0, inv: 0 };
      map[k].qty += l.qty;
      map[k].inv += l.qty * l.price;
    });
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        avgPrice: m.inv / m.qty,
        val:  m.qty * cmp,
        gain: m.qty * cmp - m.inv,
        ret:  (m.qty * cmp - m.inv) / m.inv * 100,
      }));
  }, [lots, cmp]);

  const priceLabel = qtyDecimals > 0 ? 'AVG NAV'   : 'AVG PRICE';
  const qtyLabel   = qtyDecimals > 0 ? 'UNITS'     : 'QTY';

  return (
    <div className={styles.tableScrollWrapper}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
        <thead>
          <tr>
            <TH ch="MONTH" />
            <TH ch={qtyLabel} right />
            <TH ch={priceLabel} right />
            <TH ch="INVESTED" right />
            <TH ch="VALUE" right />
            <TH ch="GAIN" right />
            <TH ch="RETURN" right />
          </tr>
        </thead>
        <tbody>
          {monthly.map((m, i) => (
            <tr key={i}>
              <TD ch={m.month} mono color="var(--text2)" />
              <TD ch={fmt(m.qty, qtyDecimals)} right mono />
              <TD ch={`₹${fmt(m.avgPrice, 2)}`} right mono />
              <TD ch={`₹${fmt(m.inv, 0)}`} right mono />
              <TD ch={`₹${fmt(m.val, 0)}`} right mono bold />
              <TD ch={`₹${fmt(m.gain, 0)}`} right mono color={colorPnl(m.gain)} bold />
              <TD ch={pct(m.ret)} right mono color={pcol(m.ret)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sell history table ────────────────────────────────────────────────────────
export function SellHistoryTable({ h, qtyDecimals = 0 }) {
  const { sells, stats } = h;
  if (!sells || !sells.length) return null;

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
            {sells.map((s, i) => (
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

// ── Holding detail panel shell ────────────────────────────────────────────────
export function HoldingDetailPanel({ h, priceMeta, chartLabel, qtyDecimals, xirrLabel }) {
  const [tab, setTab] = useState('lots');

  const xirrVal = useMemo(
    () => calcHoldingXIRR(h.lots, h.sells, h.cmp),
    [h.symbol, h.cmp, h.lots, h.sells],
  );

  const meta     = priceMeta?.[h.symbol];
  const hasSells = h.sells && h.sells.length > 0;

  const tabs = [
    ['lots',    'Lot-wise breakup'],
    ['monthly', 'Monthly breakup'],
    ...(hasSells ? [['sells', `Sell History (${h.sells.length})`]] : []),
  ];

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

          {hasSells && (
            <div className={styles.detailSellChips}>
              <span className={styles.detailSellChipWin}>✓ {h.stats.winCount} wins</span>
              <span className={styles.detailSellChipLoss}>✗ {h.stats.lossCount} losses</span>
              <span className={styles.detailSellChipRealized}>
                Realized:{' '}
                <span style={{ fontWeight: 700, color: colorPnl(h.realizedGain) }}>
                  {fmtCr(h.realizedGain)}
                </span>
              </span>
            </div>
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

        {tab === 'lots'    && <LotTable lots={h.lots} cmp={h.cmp} qtyDecimals={qtyDecimals} />}
        {tab === 'monthly' && <MonthlyTable lots={h.lots} cmp={h.cmp} qtyDecimals={qtyDecimals} />}
        {tab === 'sells'   && <SellHistoryTable h={h} qtyDecimals={qtyDecimals} />}
      </div>
    </div>
  );
}
