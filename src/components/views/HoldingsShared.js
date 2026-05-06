'use client';

import { useMemo, useState, useRef } from 'react';
import { colorPnl, fmtCr, fmt, sectorColor } from '@/lib/store';
import { xirr, holdingXIRR, lotXIRR } from '@/lib/xirr';
import { HoldingPerformanceChart } from '@/components/charts/Charts';
import { usePortfolio } from '@/context/PortfolioContext';
import { SummaryStrip } from '@/components/ui/SharedUI';

// Re-export EmptyState under the old name so MFView/StocksView don't need changing
export { EmptyState as HoldingsEmpty } from '@/components/ui/SharedUI';

// ─── Public XIRR wrappers (kept for backward-compat imports from this file) ──
export const computeXIRR      = xirr;
export const calcHoldingXIRR  = holdingXIRR;
export const calcLotXIRR      = lotXIRR;

// ─── Formatters ───────────────────────────────────────────────────────────────

export function holdStr(days) {
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
  return y > 0 ? (m > 0 ? `${y}y ${m}m` : `${y}y`) : `${m}m`;
}

export const pct  = (v, d = 2) => `${v > 0 ? '+' : ''}${fmt(v, d)}%`;
export const pcol = v => v >= 0 ? 'var(--green2)' : 'var(--red2)';

// ─── Sort options (shared) ────────────────────────────────────────────────────

export const SORTS = [
  { key: 'returnPct',     label: 'Return'     },
  { key: 'cagr',          label: 'CAGR'       },
  { key: 'marketValue',   label: 'Value'      },
  { key: 'unrealizedGain',label: 'Unrealized' },
  { key: 'realizedGain',  label: 'Realized'   },
  { key: 'invested',      label: 'Invested'   },
  { key: 'lots',          label: 'Lots'       },
];

// ─── Shared micro-components ──────────────────────────────────────────────────

export function ReturnBar({ val, max }) {
  const w = Math.min(100, (Math.abs(val) / (max || 1)) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 48, height: 3, background: 'var(--bg3)', borderRadius: 2, flexShrink: 0 }}>
        <div style={{ height: '100%', width: w + '%', background: pcol(val), borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: pcol(val) }}>{pct(val)}</span>
    </div>
  );
}

export function TaxBadge({ days }) {
  const ltcg = days >= 365;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3, letterSpacing: '0.04em',
      background: ltcg ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
      color:      ltcg ? 'var(--green2)'          : 'var(--yellow)',
      border:     `1px solid ${ltcg ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
    }}>{ltcg ? 'LTCG' : 'STCG'}</span>
  );
}

// ─── Table cell helpers ───────────────────────────────────────────────────────

export const TH = ({ ch, right }) => (
  <th style={{
    fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.07em',
    padding: '6px 8px', background: 'rgba(0,0,0,0.25)', textAlign: right ? 'right' : 'left',
    whiteSpace: 'nowrap', border: 'none', borderBottom: '1px solid var(--border)',
  }}>{ch}</th>
);

export const TD = ({ ch, right, mono, color, bold, small }) => (
  <td style={{
    padding: '6px 8px', fontSize: small ? 10 : 12, textAlign: right ? 'right' : 'left',
    fontFamily: mono ? 'var(--font-mono)' : undefined,
    color: color || 'var(--text)', fontWeight: bold ? 700 : 400,
    borderBottom: '1px solid rgba(45,64,96,0.2)', whiteSpace: 'nowrap',
  }}>{ch}</td>
);

// ─── Inline CMP price editor (only used in StocksView but lives here) ─────────

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
    if (e.key === 'Enter') save(e);
    if (e.key === 'Escape') setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>₹</span>
        <input
          ref={inputRef} type="number" value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={onKey} onBlur={save}
          style={{
            width: 72, padding: '2px 4px', fontSize: 11,
            fontFamily: 'var(--font-mono)', textAlign: 'right',
            background: 'var(--bg3)', border: '1px solid var(--accent)',
            borderRadius: 4, color: 'var(--text)',
          }}
        />
        <button onClick={save} disabled={saving} style={{
          background: 'var(--accent)', border: 'none', borderRadius: 3,
          color: '#fff', cursor: 'pointer', padding: '2px 5px', fontSize: 10, fontWeight: 700,
        }}>
          {saving ? '…' : '✓'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', padding: '9px 5px' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>₹{fmt(cmp, 1)}</span>
      <button
        onClick={startEdit} title={`Edit CMP for ${symbol}`}
        style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 3,
          color: 'var(--text3)', cursor: 'pointer', padding: '1px 4px',
          fontSize: 9, lineHeight: 1, opacity: 0.6, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent2)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; }}
      >✎</button>
    </div>
  );
}

// ─── Shared controls bar ──────────────────────────────────────────────────────
// groupLabel: 'SECTOR' | 'CATEGORY'
// groups: string[]
// activeGroup: string
// onGroupChange: fn
// sort / onSortToggle
// extra: optional JSX (e.g. filter input for stocks)
// onExport: fn

export function HoldingsControls({ groupLabel, groups, activeGroup, onGroupChange, sort, onSortToggle, extra, onExport }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase', flexShrink: 0 }}>
          {groupLabel}
        </span>
        {groups.map(g => (
          <button key={g} onClick={() => onGroupChange(g)} style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: activeGroup === g ? `1px solid ${g === 'All' ? 'var(--accent)' : sectorColor(g)}` : '1px solid var(--border)',
            background: activeGroup === g ? (g === 'All' ? 'var(--accent)' : sectorColor(g) + '33') : 'var(--bg3)',
            color: activeGroup === g ? (g === 'All' ? '#fff' : sectorColor(g)) : 'var(--text2)',
          }}>{g}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>SORT</span>
        {SORTS.map(s => (
          <button key={s.key} onClick={() => onSortToggle(s.key)} style={{
            padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${sort.key === s.key ? 'var(--accent)' : 'var(--border)'}`,
            background: sort.key === s.key ? 'rgba(59,130,246,0.12)' : 'transparent',
            color: sort.key === s.key ? 'var(--accent2)' : 'var(--text3)',
          }}>{s.label}{sort.key === s.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>
        ))}
        {extra}
        <button onClick={onExport} className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 11 }}>↓ CSV</button>
      </div>
    </div>
  );
}

// ─── Shared lot table (used inside DetailPanel for both views) ─────────────────
// qtyDecimals: 0 for stocks, 3 for MF

export function LotTable({ lots, cmp, qtyDecimals = 0 }) {
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <TH ch="BUY DATE" />
              <TH ch={qtyDecimals > 0 ? 'BUY NAV' : 'BUY PRICE'} right />
              <TH ch={qtyDecimals > 0 ? 'UNITS' : 'QTY'} right />
              <TH ch="INVESTED" right /><TH ch="GAIN" right /><TH ch="RETURN" right />
              <TH ch="XIRR" right /><TH ch="HOLD" right /><TH ch="TAX" />
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
            <tr style={{ background: 'rgba(59,130,246,0.06)' }}>
              <td colSpan={2} style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text3)' }}>
                TOTAL · {lots.length} LOTS
              </td>
              <TD ch={fmt(lots.reduce((s, l) => s + l.qty, 0), qtyDecimals)} right mono bold />
              <TD ch={`₹${fmt(lots.reduce((s, l) => s + l.qty * l.price, 0), 0)}`} right mono bold />
              <TD ch={fmtCr(lots.reduce((s, l) => s + (l.qty * cmp - l.qty * l.price), 0))} right mono
                  color={colorPnl(lots.reduce((s, l) => s + (l.qty * cmp - l.qty * l.price), 0))} bold />
              <TD ch={pct((() => {
                const inv = lots.reduce((s, l) => s + l.qty * l.price, 0);
                const val = lots.reduce((s, l) => s + l.qty * cmp, 0);
                return inv > 0 ? (val - inv) / inv * 100 : 0;
              })())} right mono color={pcol(lots.reduce((s, l) => s + (l.qty * cmp - l.qty * l.price), 0))} bold />
              <TD ch="← XIRR above" right small color="var(--text3)" />
              <TD ch="" /><TD ch="" />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
        XIRR = money-weighted return — accounts for exact timing of each purchase.
      </div>
    </>
  );
}

// ─── Shared monthly breakdown table ──────────────────────────────────────────

export function MonthlyTable({ lots, cmp, qtyDecimals = 0 }) {
  const monthly = useMemo(() => {
    const map = {};
    lots.forEach(l => {
      const k = l.date.slice(0, 7);
      if (!map[k]) map[k] = { month: k, qty: 0, inv: 0 };
      map[k].qty += l.qty; map[k].inv += l.qty * l.price;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m,
      avgPrice: m.inv / m.qty,
      val:  m.qty * cmp,
      gain: m.qty * cmp - m.inv,
      ret:  (m.qty * cmp - m.inv) / m.inv * 100,
    }));
  }, [lots, cmp]);

  const priceLabel = qtyDecimals > 0 ? 'AVG NAV' : 'AVG PRICE';
  const qtyLabel   = qtyDecimals > 0 ? 'UNITS'   : 'QTY';

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
        <thead>
          <tr>
            <TH ch="MONTH" /><TH ch={qtyLabel} right /><TH ch={priceLabel} right />
            <TH ch="INVESTED" right /><TH ch="VALUE" right /><TH ch="GAIN" right /><TH ch="RETURN" right />
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

// ─── Shared sell history table ────────────────────────────────────────────────

export function SellHistoryTable({ h, qtyDecimals = 0 }) {
  const { sells, stats } = h;
  if (!sells || !sells.length) return null;

  const TaxChip = ({ type }) => (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      background: type === 'LTCG' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
      color:      type === 'LTCG' ? 'var(--green2)' : 'var(--yellow)',
      border:     `1px solid ${type === 'LTCG' ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
    }}>{type}</span>
  );

  const priceLabel = qtyDecimals > 0 ? 'SELL NAV' : 'SELL PRICE';
  const qtyLabel   = qtyDecimals > 0 ? 'UNITS'    : 'QTY';

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
          <thead>
            <tr>
              <TH ch="SELL DATE" /><TH ch={priceLabel} right /><TH ch={qtyLabel} right />
              <TH ch="PROCEEDS" right /><TH ch="REALIZED" right /><TH ch="TAX TYPE" />
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
                        background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)',
                      }}>
                        {fmt(ml.qty, qtyDecimals)}@{fmt(ml.buyPrice, qtyDecimals > 0 ? 2 : 0)} ({ml.holdDays}d)
                      </span>
                    ))}
                  </div>
                } />
              </tr>
            ))}
            <tr style={{ background: 'rgba(245,158,11,0.06)' }}>
              <td colSpan={3} style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text3)' }}>
                TOTAL · {sells.length} SELL(S)
              </td>
              <TD ch={fmtCr(stats.totalSellProceeds)} right mono bold />
              <TD ch={fmtCr(h.realizedGain)} right mono color={colorPnl(h.realizedGain)} bold />
              <TD ch="" /><TD ch="" />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
        FIFO matching — oldest {qtyDecimals > 0 ? 'units redeemed' : 'lots consumed'} first. Hold days per matched lot determines LTCG/STCG.
      </div>
    </>
  );
}

// ─── Shared detail panel shell ────────────────────────────────────────────────
// chartLabel: string shown above chart
// qtyDecimals: 0 | 3
// xirrLabel: 'Stock XIRR' | 'Fund XIRR'

export function HoldingDetailPanel({ h, priceMeta, chartLabel, qtyDecimals, xirrLabel }) {
  const [tab, setTab] = useState('lots');
  const xirr = useMemo(() => calcHoldingXIRR(h.lots, h.sells, h.cmp), [h.symbol, h.cmp]);
  const meta = priceMeta?.[h.symbol];
  const hasSells = h.sells && h.sells.length > 0;

  return (
    <div style={{ background: 'rgba(8,14,28,0.85)', borderTop: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 16px 16px' }}>

        {/* XIRR + stats bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {xirrLabel}:{' '}
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green2)' }}>
              {xirr != null ? pct(xirr) : '—'}
            </span>{' '}
            <span style={{ color: 'var(--text3)' }}>p.a.</span>
          </div>
          {hasSells && (
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.1)', color: 'var(--green2)', border: '1px solid rgba(16,185,129,0.25)', fontWeight: 700 }}>
                ✓ {h.stats.winCount} wins
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: 'var(--red2)', border: '1px solid rgba(239,68,68,0.25)', fontWeight: 700 }}>
                ✗ {h.stats.lossCount} losses
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.08)', color: 'var(--accent2)', border: '1px solid rgba(59,130,246,0.2)' }}>
                Realized: <span style={{ fontWeight: 700, color: colorPnl(h.realizedGain) }}>{fmtCr(h.realizedGain)}</span>
              </span>
            </div>
          )}
          {meta && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              Price: {meta.source}{meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleString('en-IN')}` : ''}
            </span>
          )}
        </div>

        {/* Chart */}
        <div style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            {chartLabel}
          </div>
          <HoldingPerformanceChart lots={h.lots} cmp={h.cmp} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
          {[
            ['lots', 'Lot-wise breakup'],
            ['monthly', 'Monthly breakup'],
            ...(hasSells ? [['sells', `Sell History (${h.sells.length})`]] : []),
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '5px 12px',
              fontSize: 11, fontWeight: 600, marginBottom: -1,
              color: tab === k ? 'var(--accent2)' : 'var(--text3)',
              borderBottom: `2px solid ${tab === k ? 'var(--accent2)' : 'transparent'}`,
            }}>{l}</button>
          ))}
        </div>

        {tab === 'lots'    && <LotTable lots={h.lots} cmp={h.cmp} qtyDecimals={qtyDecimals} />}
        {tab === 'monthly' && <MonthlyTable lots={h.lots} cmp={h.cmp} qtyDecimals={qtyDecimals} />}
        {tab === 'sells'   && <SellHistoryTable h={h} qtyDecimals={qtyDecimals} />}
      </div>
    </div>
  );
}


