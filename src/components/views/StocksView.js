'use client';

import { useState, useMemo, useRef } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import { HoldingPerformanceChart } from '@/components/charts/Charts';

// ── XIRR ─────────────────────────────────────────────────────────────────────
function computeXIRR(cashflows) {
  if (!cashflows || cashflows.length < 2) return null;
  const dates   = cashflows.map(c => new Date(c.date));
  const amounts = cashflows.map(c => c.amount);
  const d0      = dates[0];
  const yr      = i => (dates[i] - d0) / (365.25 * 864e5);
  const npv     = r => amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, yr(i)), 0);
  const dnpv    = r => amounts.reduce((s, a, i) => s - yr(i) * a / Math.pow(1 + r, yr(i) + 1), 0);
  let rate = 0.1;
  for (let k = 0; k < 100; k++) {
    const d = dnpv(rate), f = npv(rate);
    if (Math.abs(d) < 1e-10) break;
    const nr = rate - f / d;
    if (Math.abs(nr - rate) < 1e-7) { rate = nr; break; }
    rate = Math.max(nr, -0.999);
  }
  return isFinite(rate) ? rate * 100 : null;
}

function calcStockXIRR(lots, sells, cmp) {
  const tQty = lots.reduce((s, l) => s + l.qty, 0);
  const sellCFs = (sells || []).map(s => ({ amount: s.qty * s.sellPrice, date: s.date }));
  return computeXIRR([
    ...lots.map(l => ({ amount: -(l.qty * l.price), date: l.date })),
    ...sellCFs,
    ...(tQty > 0 ? [{ amount: tQty * cmp, date: new Date().toISOString().slice(0, 10) }] : []),
  ]);
}

function calcLotXIRR(lot, cmp) {
  return computeXIRR([
    { amount: -(lot.qty * lot.price), date: lot.date },
    { amount: lot.qty * cmp,          date: new Date().toISOString().slice(0, 10) },
  ]);
}

function holdStr(days) {
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
  return y > 0 ? (m > 0 ? `${y}y ${m}m` : `${y}y`) : `${m}m`;
}

const pct  = (v, d = 2) => `${v > 0 ? '+' : ''}${fmt(v, d)}%`;
const pcol = v => v >= 0 ? 'var(--green2)' : 'var(--red2)';

// ─────────────────────────────────────────────────────────────────────────────
function ReturnBar({ val, max }) {
  const w = Math.min(100, (Math.abs(val) / (max || 1)) * 100);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ width:48, height:3, background:'var(--bg3)', borderRadius:2, flexShrink:0 }}>
        <div style={{ height:'100%', width:w+'%', background:pcol(val), borderRadius:2 }} />
      </div>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:pcol(val) }}>{pct(val)}</span>
    </div>
  );
}

function TaxBadge({ days }) {
  const ltcg = days >= 365;
  return (
    <span style={{
      fontSize:10, fontWeight:700, padding:'2px 5px', borderRadius:3, letterSpacing:'0.04em',
      background: ltcg ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
      color:      ltcg ? 'var(--green2)'          : 'var(--yellow)',
      border:     `1px solid ${ltcg ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
    }}>{ltcg ? 'LTCG' : 'STCG'}</span>
  );
}

// ── Inline Price Editor ───────────────────────────────────────────────────────
function PriceCell({ symbol, cmp, onSaved }) {
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
      <div style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 0' }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize:11, color:'var(--text3)' }}>₹</span>
        <input
          ref={inputRef}
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={onKey}
          onBlur={save}
          style={{
            width:72, padding:'2px 4px', fontSize:11,
            fontFamily:'var(--font-mono)', textAlign:'right',
            background:'var(--bg3)', border:'1px solid var(--accent)',
            borderRadius:4, color:'var(--text)',
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          style={{ background:'var(--accent)', border:'none', borderRadius:3, color:'#fff', cursor:'pointer', padding:'2px 5px', fontSize:10, fontWeight:700 }}
        >
          {saving ? '…' : '✓'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end', padding:'9px 5px' }}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>₹{fmt(cmp, 1)}</span>
      <button
        onClick={startEdit}
        title={`Edit CMP for ${symbol}`}
        style={{
          background:'transparent', border:'1px solid var(--border)', borderRadius:3,
          color:'var(--text3)', cursor:'pointer', padding:'1px 4px',
          fontSize:9, lineHeight:1, opacity:0.6, transition:'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity='1'; e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent2)'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity='0.6'; e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text3)'; }}
      >
        ✎
      </button>
    </div>
  );
}

// ── 13-column grid (added realized gain column) ───────────────────────────────
const COL = '20px 1fr 120px 32px 72px 110px 80px 80px 80px 88px 64px 130px 50px';

function HeaderRow() {
  const cols = ['', 'STOCK', 'SECTOR', '#', 'QTY', 'CMP ✎', 'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD'];
  return (
    <div style={{
      display:'grid', gridTemplateColumns: COL, padding:'0 6px',
      background:'var(--bg3)', borderBottom:'1px solid var(--border)',
    }}>
      {cols.map((c, i) => (
        <div key={i} style={{
          fontSize:9, fontWeight:700, letterSpacing:'0.07em',
          color: i === 5 ? 'var(--accent2)' : i === 8 ? 'var(--yellow)' : 'var(--text3)',
          padding:'7px 5px', textAlign: i > 2 ? 'right' : 'left', whiteSpace:'nowrap',
        }}>{c}</div>
      ))}
    </div>
  );
}

// ── Expanded detail ───────────────────────────────────────────────────────────
function DetailPanel({ h, priceMeta }) {
  const [tab, setTab] = useState('lots');
  // Include sell cashflows for a more accurate XIRR
  const xirr = useMemo(() => calcStockXIRR(h.lots, h.sells, h.cmp), [h.symbol, h.cmp]);
  const meta = priceMeta?.[h.symbol];

  const monthly = useMemo(() => {
    const map = {};
    h.lots.forEach(l => {
      const k = l.date.slice(0, 7);
      if (!map[k]) map[k] = { month: k, qty: 0, inv: 0 };
      map[k].qty += l.qty; map[k].inv += l.qty * l.price;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m,
      avgPrice: m.inv / m.qty,
      val: m.qty * h.cmp,
      gain: m.qty * h.cmp - m.inv,
      ret: (m.qty * h.cmp - m.inv) / m.inv * 100,
    }));
  }, [h.symbol, h.cmp]);

  const TH = ({ ch, right }) => (
    <th style={{ fontSize:10, color:'var(--text3)', fontWeight:700, letterSpacing:'0.07em',
      padding:'6px 8px', background:'rgba(0,0,0,0.25)', textAlign:right?'right':'left',
      whiteSpace:'nowrap', border:'none', borderBottom:'1px solid var(--border)' }}>{ch}</th>
  );
  const TD = ({ ch, right, mono, color, bold, small }) => (
    <td style={{ padding:'6px 8px', fontSize:small?10:12, textAlign:right?'right':'left',
      fontFamily:mono?'var(--font-mono)':undefined,
      color:color||'var(--text)', fontWeight:bold?700:400,
      borderBottom:'1px solid rgba(45,64,96,0.2)', whiteSpace:'nowrap' }}>{ch}</td>
  );

  const hasSells = h.sells && h.sells.length > 0;

  return (
    <div style={{ background:'rgba(8,14,28,0.85)', borderTop:'1px solid var(--border)' }}>
      <div style={{ padding:'12px 16px 16px' }}>
        {/* XIRR + stats summary */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'16px', marginBottom:10, alignItems:'center' }}>
          <div style={{ fontSize:12, color:'var(--text2)' }}>
            Stock XIRR:{' '}
            <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--green2)' }}>
              {xirr != null ? pct(xirr) : '—'}
            </span>{' '}
            <span style={{ color:'var(--text3)' }}>p.a.</span>
          </div>
          {/* Win/loss stats */}
          {hasSells && (
            <div style={{ display:'flex', gap:8 }}>
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4,
                background:'rgba(16,185,129,0.1)', color:'var(--green2)',
                border:'1px solid rgba(16,185,129,0.25)', fontWeight:700 }}>
                ✓ {h.stats.winCount} wins
              </span>
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4,
                background:'rgba(239,68,68,0.1)', color:'var(--red2)',
                border:'1px solid rgba(239,68,68,0.25)', fontWeight:700 }}>
                ✗ {h.stats.lossCount} losses
              </span>
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4,
                background:'rgba(59,130,246,0.08)', color:'var(--accent2)',
                border:'1px solid rgba(59,130,246,0.2)' }}>
                Realized: <span style={{ fontWeight:700, color:colorPnl(h.realizedGain) }}>{fmtCr(h.realizedGain)}</span>
              </span>
            </div>
          )}
          {meta && (
            <span style={{ fontSize:11, color:'var(--text3)' }}>
              Price: {meta.source}{meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleString('en-IN')}` : ''}
            </span>
          )}
        </div>

        <div style={{ background:'rgba(59,130,246,0.04)', border:'1px solid var(--border)', borderRadius:8, padding:12, marginBottom:12 }}>
          <div style={{ fontSize:11, color:'var(--text3)', fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', marginBottom:8 }}>
            Investment Path vs Current CMP
          </div>
          <HoldingPerformanceChart lots={h.lots} cmp={h.cmp} />
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', marginBottom:10, borderBottom:'1px solid var(--border)' }}>
          {[
            ['lots','Lot-wise breakup'],
            ['monthly','Monthly breakup'],
            ...(hasSells ? [['sells', `Sell History (${h.sells.length})`]] : []),
          ].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              background:'none', border:'none', cursor:'pointer', padding:'5px 12px',
              fontSize:11, fontWeight:600, marginBottom:-1,
              color: tab===k ? 'var(--accent2)' : 'var(--text3)',
              borderBottom:`2px solid ${tab===k ? 'var(--accent2)' : 'transparent'}`,
            }}>{l}</button>
          ))}
        </div>

        {tab === 'lots' && (
          <>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                <thead>
                  <tr>
                    <TH ch="BUY DATE" /><TH ch="BUY PRICE" right /><TH ch="QTY" right />
                    <TH ch="INVESTED" right /><TH ch="GAIN" right /><TH ch="RETURN" right />
                    <TH ch="XIRR" right /><TH ch="HOLD" right /><TH ch="TAX" />
                  </tr>
                </thead>
                <tbody>
                  {h.lots.map((l, i) => {
                    const inv  = l.qty * l.price;
                    const gain = l.qty * h.cmp - inv;
                    const ret  = inv > 0 ? gain / inv * 100 : 0;
                    const days = Math.round((new Date() - new Date(l.date)) / 864e5);
                    const xi   = calcLotXIRR(l, h.cmp);
                    return (
                      <tr key={i}>
                        <TD ch={l.date} mono color="var(--text2)" />
                        <TD ch={`₹${fmt(l.price, 2)}`} right mono />
                        <TD ch={fmt(l.qty, 0)} right mono />
                        <TD ch={`₹${fmt(inv, 0)}`} right mono />
                        <TD ch={`₹${fmt(gain, 0)}`} right mono color={colorPnl(gain)} bold />
                        <TD ch={pct(ret)} right mono color={pcol(ret)} />
                        <TD ch={xi != null ? pct(xi) : '—'} right mono color="var(--accent2)" />
                        <TD ch={holdStr(days)} right mono color="var(--text2)" />
                        <TD ch={<TaxBadge days={days} />} />
                      </tr>
                    );
                  })}
                  <tr style={{ background:'rgba(59,130,246,0.06)' }}>
                    <td colSpan={2} style={{ padding:'6px 8px', fontSize:10, color:'var(--text3)' }}>TOTAL · {h.lots.length} LOTS</td>
                    <TD ch={fmt(h.qty, 0)} right mono bold />
                    <TD ch={`₹${fmt(h.invested, 0)}`} right mono bold />
                    <TD ch={fmtCr(h.unrealizedGain)} right mono color={colorPnl(h.unrealizedGain)} bold />
                    <TD ch={pct(h.unrealizedReturnPct)} right mono color={pcol(h.unrealizedReturnPct)} bold />
                    <TD ch="← stock XIRR" right small color="var(--text3)" />
                    <TD ch="" /><TD ch="" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>
              XIRR = money-weighted return — accounts for exact timing of each purchase.
            </div>
          </>
        )}

        {tab === 'monthly' && (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
              <thead>
                <tr>
                  <TH ch="MONTH" /><TH ch="QTY" right /><TH ch="AVG PRICE" right />
                  <TH ch="INVESTED" right /><TH ch="VALUE" right /><TH ch="GAIN" right /><TH ch="RETURN" right />
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr key={i}>
                    <TD ch={m.month} mono color="var(--text2)" />
                    <TD ch={fmt(m.qty, 0)} right mono />
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
        )}

        {tab === 'sells' && hasSells && (
          <>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:620 }}>
                <thead>
                  <tr>
                    <TH ch="SELL DATE" /><TH ch="SELL PRICE" right /><TH ch="QTY" right />
                    <TH ch="PROCEEDS" right /><TH ch="REALIZED" right /><TH ch="TAX TYPE" />
                    <TH ch="FIFO LOTS MATCHED" />
                  </tr>
                </thead>
                <tbody>
                  {h.sells.map((s, i) => (
                    <tr key={i}>
                      <TD ch={s.date} mono color="var(--text2)" />
                      <TD ch={`₹${fmt(s.sellPrice, 2)}`} right mono />
                      <TD ch={fmt(s.qty, 0)} right mono />
                      <TD ch={fmtCr(s.qty * s.sellPrice)} right mono />
                      <TD ch={fmtCr(s.realized)} right mono color={colorPnl(s.realized)} bold />
                      <TD ch={
                        <span style={{
                          fontSize:10, fontWeight:700, padding:'2px 5px', borderRadius:3,
                          background: s.taxType === 'LTCG' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                          color:      s.taxType === 'LTCG' ? 'var(--green2)' : 'var(--yellow)',
                          border:     `1px solid ${s.taxType === 'LTCG' ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                        }}>{s.taxType}</span>
                      } />
                      <TD ch={
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {s.matchedLots.map((ml, mi) => (
                            <span key={mi} style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)',
                              background:'var(--bg3)', padding:'1px 5px', borderRadius:3, border:'1px solid var(--border)' }}>
                              {fmt(ml.qty,0)}@{fmt(ml.buyPrice,0)} ({ml.holdDays}d)
                            </span>
                          ))}
                        </div>
                      } />
                    </tr>
                  ))}
                  <tr style={{ background:'rgba(245,158,11,0.06)' }}>
                    <td colSpan={3} style={{ padding:'6px 8px', fontSize:10, color:'var(--text3)' }}>TOTAL · {h.sells.length} SELL(S)</td>
                    <TD ch={fmtCr(h.stats.totalSellProceeds)} right mono bold />
                    <TD ch={fmtCr(h.realizedGain)} right mono color={colorPnl(h.realizedGain)} bold />
                    <TD ch="" /><TD ch="" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>
              FIFO matching — oldest lots consumed first. Holding days per matched lot determines LTCG/STCG.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sort options ──────────────────────────────────────────────────────────────
const SORTS = [
  { key:'returnPct', label:'Return' }, { key:'cagr', label:'CAGR' },
  { key:'marketValue', label:'Value' }, { key:'unrealizedGain', label:'Unrealized' },
  { key:'realizedGain', label:'Realized' }, { key:'invested', label:'Invested' },
  { key:'lots', label:'Lots' },
];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StocksView() {
  const { stHoldings, stats, setActiveView, priceMeta, realizedSummary } = usePortfolio();
  const [sort, setSort]       = useState({ key:'returnPct', dir:-1 });
  const [sector, setSector]   = useState('All');
  const [filter, setFilter]   = useState('');
  const [expanded, setExpanded] = useState({});

  const sectors = useMemo(() =>
    ['All', ...[...new Set(stHoldings.map(h => h.sector||'Other'))].sort()],
  [stHoldings]);

  const rows = useMemo(() => {
    let list = sector === 'All' ? [...stHoldings] : stHoldings.filter(h => (h.sector||'Other') === sector);
    if (filter) list = list.filter(h => h.symbol.toLowerCase().includes(filter.toLowerCase()) || (h.sector||'').toLowerCase().includes(filter.toLowerCase()));
    const k = sort.key;
    list.sort((a, b) => sort.dir * ((k==='lots' ? a.lots.length - b.lots.length : (a[k]??0) - (b[k]??0))));
    return list;
  }, [stHoldings, sector, filter, sort]);

  const maxRet = useMemo(() => Math.max(...stHoldings.map(h => Math.abs(h.returnPct)), 1), [stHoldings]);
  const stGain = stats.stValue - stats.stInvested;

  // Realized P&L for stocks only
  const stRealized = useMemo(() => {
    return stHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0);
  }, [stHoldings]);
  const stWins  = stHoldings.reduce((s, h) => s + (h.stats?.winCount  || 0), 0);
  const stLoss  = stHoldings.reduce((s, h) => s + (h.stats?.lossCount || 0), 0);

  if (!stHoldings.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'50vh', gap:12 }}>
      <div style={{ fontSize:40 }}>◐</div>
      <div style={{ fontSize:16, fontWeight:600 }}>No stock holdings yet</div>
      <button className="btn btn-primary" onClick={() => setActiveView('trade')}>+ Add Stock Trade</button>
    </div>
  );

  function toggleSort(k) { setSort(s => s.key===k ? { key:k, dir:-s.dir } : { key:k, dir:-1 }); }
  function toggle(sym)    { setExpanded(e => ({ ...e, [sym]: !e[sym] })); }

  function exportCSV() {
    const rows2 = [['Stock','Sector','Lots','Qty','CMP','Avg Buy','Invested','Value','Unrealized','Realized','Total Gain','Return%','CAGR','Holding']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector||'', h.lots.length, fmt(h.qty,0), fmt(h.cmp,2), fmt(h.avgBuy,2),
      fmt(h.invested,0), fmt(h.marketValue,0), fmt(h.unrealizedGain,0), fmt(h.realizedGain,0),
      fmt(h.totalGain,0), fmt(h.returnPct,2)+'%', fmt(h.cagr,2)+'%', holdStr(h.holdingDays),
    ]));
    const a = document.createElement('a'); a.href = 'data:text/csv,'+encodeURIComponent(rows2.map(r=>r.join(',')).join('\n')); a.download = 'stocks.csv'; a.click();
  }

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Summary strip — now 7 cells */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:10 }}>
        {[
          { l:'Stock Value',   v: fmtCr(stats.stValue),    c:'var(--purple)' },
          { l:'Invested',      v: fmtCr(stats.stInvested), c:'var(--text)' },
          { l:'Unrealized',    v: fmtCr(stGain),            c: colorPnl(stGain) },
          { l:'Realized P&L', v: fmtCr(stRealized),        c: colorPnl(stRealized) },
          { l:'Total Gain',    v: fmtCr(stGain + stRealized), c: colorPnl(stGain + stRealized) },
          { l:'W / L',         v: `${stWins}W / ${stLoss}L`, c: stWins > stLoss ? 'var(--green2)' : 'var(--red2)' },
          { l:'Stocks',        v: stats.stockCount,          c:'var(--accent2)' },
        ].map((m,i) => (
          <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'11px 14px' }}>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{m.l}</div>
            <div style={{ fontSize:17, fontWeight:700, fontFamily:'var(--font-mono)', color:m.c }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', flex:1, minWidth:0 }}>
          <span style={{ fontSize:9, fontWeight:700, color:'var(--text3)', letterSpacing:'0.07em', textTransform:'uppercase', flexShrink:0 }}>SECTOR</span>
          {sectors.map(s => (
            <button key={s} onClick={() => setSector(s)} style={{
              padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
              border: sector===s ? `1px solid ${s==='All' ? 'var(--accent)' : sectorColor(s)}` : '1px solid var(--border)',
              background: sector===s ? (s==='All' ? 'var(--accent)' : sectorColor(s)+'33') : 'var(--bg3)',
              color: sector===s ? (s==='All' ? '#fff' : sectorColor(s)) : 'var(--text2)',
            }}>{s}</button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', flexShrink:0 }}>
          <span style={{ fontSize:9, fontWeight:700, color:'var(--text3)', letterSpacing:'0.07em', textTransform:'uppercase' }}>SORT</span>
          {SORTS.map(s => (
            <button key={s.key} onClick={() => toggleSort(s.key)} style={{
              padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer',
              border:`1px solid ${sort.key===s.key ? 'var(--accent)' : 'var(--border)'}`,
              background: sort.key===s.key ? 'rgba(59,130,246,0.12)' : 'transparent',
              color: sort.key===s.key ? 'var(--accent2)' : 'var(--text3)',
            }}>{s.label}{sort.key===s.key ? (sort.dir===1?' ↑':' ↓') : ''}</button>
          ))}
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…"
            style={{ width:90, padding:'3px 8px', fontSize:11 }} />
          <button onClick={exportCSV} className="btn btn-ghost" style={{ padding:'3px 9px', fontSize:11 }}>↓ CSV</button>
        </div>
      </div>

      {/* Price edit hint */}
      <div style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:6, paddingLeft:2 }}>
        <span style={{ color:'var(--accent2)', fontWeight:600 }}>✎</span>
        Click edit icon next to CMP to update price · Click row to expand lot details + sell history
      </div>

      {/* Table */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
        <HeaderRow />
        {rows.map(h => {
          const open = !!expanded[h.symbol];
          const hasRealized = (h.realizedGain || 0) !== 0;
          return (
            <div key={h.symbol} style={{ borderBottom:'1px solid rgba(45,64,96,0.35)' }}>
              <div
                onClick={() => toggle(h.symbol)}
                style={{
                  display:'grid', gridTemplateColumns: COL,
                  padding:'0 6px', cursor:'pointer', alignItems:'center',
                  background: open ? 'rgba(59,130,246,0.07)' : 'transparent',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background='rgba(255,255,255,0.025)'; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background='transparent'; }}
              >
                {/* Chevron */}
                <div style={{ textAlign:'center', color:'var(--text3)', fontSize:8 }}>{open?'▼':'►'}</div>

                {/* Symbol */}
                <div style={{ padding:'9px 5px' }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:700 }}>{h.symbol}</div>
                  {h.sells?.length > 0 && (
                    <div style={{ fontSize:9, color:'var(--yellow)', marginTop:1 }}>
                      {h.sells.length} sell{h.sells.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Sector */}
                <div style={{ padding:'9px 5px', minWidth:0 }}>
                  <span style={{ fontSize:9, fontWeight:600, padding:'2px 5px', borderRadius:4, whiteSpace:'nowrap', display:'inline-block', maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis',
                    background:`${sectorColor(h.sector||'Other')}20`, color:sectorColor(h.sector||'Other'),
                    border:`1px solid ${sectorColor(h.sector||'Other')}40` }}>{h.sector||'Other'}</span>
                </div>

                {/* # lots */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text2)' }}>{h.lots.length}</div>

                {/* Qty */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text2)' }}>{fmt(h.qty, 0)}</div>

                {/* CMP */}
                <div onClick={e => e.stopPropagation()}>
                  <PriceCell symbol={h.symbol} cmp={h.cmp} />
                </div>

                {/* Invested */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11 }}>{fmtCr(h.invested)}</div>

                {/* Value */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:12, fontWeight:700 }}>{fmtCr(h.marketValue)}</div>

                {/* Realized */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600,
                  color: hasRealized ? colorPnl(h.realizedGain) : 'var(--text3)' }}>
                  {hasRealized ? fmtCr(h.realizedGain) : '—'}
                </div>

                {/* Unrealized Gain */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600, color:colorPnl(h.unrealizedGain) }}>{fmtCr(h.unrealizedGain)}</div>

                {/* CAGR */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:pcol(h.cagr) }}>{pct(h.cagr)}</div>

                {/* Return bar */}
                <div style={{ padding:'9px 5px' }}><ReturnBar val={h.returnPct} max={maxRet} /></div>

                {/* Holding */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text2)' }}>{holdStr(h.holdingDays)}</div>
              </div>
              {open && <DetailPanel h={h} priceMeta={priceMeta} />}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'var(--text3)', fontSize:13 }}>No stocks match the selected filter.</div>
        )}
      </div>
    </div>
  );
}
