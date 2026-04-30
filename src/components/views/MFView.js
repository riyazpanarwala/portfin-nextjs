'use client';

import { useState, useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';

// ── XIRR (Newton-Raphson) ─────────────────────────────────────────────────────
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

function calcFundXIRR(lots, cmp) {
  const tQty = lots.reduce((s, l) => s + l.qty, 0);
  return computeXIRR([
    ...lots.map(l => ({ amount: -(l.qty * l.price), date: l.date })),
    { amount: tQty * cmp, date: new Date().toISOString().slice(0, 10) },
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 48, height: 3, background: 'var(--bg3)', borderRadius: 2, flexShrink: 0 }}>
        <div style={{ height: '100%', width: w + '%', background: pcol(val), borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: pcol(val) }}>
        {pct(val)}
      </span>
    </div>
  );
}

function TaxBadge({ days }) {
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

// ── 12-column grid ────────────────────────────────────────────────────────────
// chevron | fund name | category | # | units | cmp | invested | value | gain | cagr | return% | hold
const COL = '20px 1fr 80px 32px 72px 72px 80px 80px 88px 64px 130px 50px';

function HeaderRow() {
  const cols = ['', 'FUND NAME', 'CAT', '#', 'UNITS', 'CMP', 'INVESTED', 'VALUE', 'GAIN', 'CAGR', 'RETURN %', 'HOLD'];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COL, padding: '0 6px',
      background: 'var(--bg3)', borderBottom: '1px solid var(--border)',
    }}>
      {cols.map((c, i) => (
        <div key={i} style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text3)',
          padding: '7px 5px', textAlign: i > 2 ? 'right' : 'left', whiteSpace: 'nowrap',
        }}>{c}</div>
      ))}
    </div>
  );
}

// ── Expanded detail ───────────────────────────────────────────────────────────
function DetailPanel({ h }) {
  const [tab, setTab] = useState('lots');
  const xirr = useMemo(() => calcFundXIRR(h.lots, h.cmp), [h.symbol, h.cmp]);

  const monthly = useMemo(() => {
    const map = {};
    h.lots.forEach(l => {
      const k = l.date.slice(0, 7);
      if (!map[k]) map[k] = { month: k, qty: 0, inv: 0 };
      map[k].qty += l.qty; map[k].inv += l.qty * l.price;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m,
      avgNav: m.inv / m.qty,
      val: m.qty * h.cmp,
      gain: m.qty * h.cmp - m.inv,
      ret: (m.qty * h.cmp - m.inv) / m.inv * 100,
    }));
  }, [h.symbol, h.cmp]);

  const TH = ({ ch, right }) => (
    <th style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.07em',
      padding: '6px 8px', background: 'rgba(0,0,0,0.25)', textAlign: right ? 'right' : 'left',
      whiteSpace: 'nowrap', border: 'none', borderBottom: '1px solid var(--border)' }}>{ch}</th>
  );
  const TD = ({ ch, right, mono, color, bold, small }) => (
    <td style={{ padding: '6px 8px', fontSize: small ? 10 : 12, textAlign: right ? 'right' : 'left',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
      color: color || 'var(--text)', fontWeight: bold ? 700 : 400,
      borderBottom: '1px solid rgba(45,64,96,0.2)', whiteSpace: 'nowrap' }}>{ch}</td>
  );

  return (
    <div style={{ background: 'rgba(8,14,28,0.85)', borderTop: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 16px 16px' }}>
        {/* XIRR summary */}
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          Fund XIRR (money-weighted):{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green2)' }}>
            {xirr != null ? pct(xirr) : '—'}
          </span>{' '}
          <span style={{ color: 'var(--text3)' }}>p.a.</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
          {[['lots', 'Lot-wise breakup'], ['monthly', 'Monthly breakup']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '5px 12px',
              fontSize: 11, fontWeight: 600, marginBottom: -1,
              color: tab === k ? 'var(--accent2)' : 'var(--text3)',
              borderBottom: `2px solid ${tab === k ? 'var(--accent2)' : 'transparent'}`,
            }}>{l}</button>
          ))}
        </div>

        {tab === 'lots' && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <TH ch="BUY DATE" /><TH ch="BUY NAV" right /><TH ch="UNITS" right />
                    <TH ch="INVESTED" right /><TH ch="GAIN" right /><TH ch="RETURN" right />
                    <TH ch="XIRR" right /><TH ch="HOLD" right /><TH ch="TAX" />
                  </tr>
                </thead>
                <tbody>
                  {h.lots.map((l, i) => {
                    const inv  = l.qty * l.price;
                    const gain = l.qty * h.cmp - inv;
                    const ret  = inv > 0 ? gain / inv * 100 : 0;
                    const days = Math.round((Date.now() - new Date(l.date)) / 864e5);
                    const xi   = calcLotXIRR(l, h.cmp);
                    return (
                      <tr key={i}>
                        <TD ch={l.date} mono color="var(--text2)" />
                        <TD ch={`₹${fmt(l.price, 2)}`} right mono />
                        <TD ch={fmt(l.qty, 3)} right mono />
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
                    <td colSpan={2} style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text3)' }}>TOTAL · {h.lots.length} LOTS</td>
                    <TD ch={fmt(h.qty, 3)} right mono bold />
                    <TD ch={`₹${fmt(h.invested, 0)}`} right mono bold />
                    <TD ch={fmtCr(h.gain)} right mono color={colorPnl(h.gain)} bold />
                    <TD ch={pct(h.returnPct)} right mono color={pcol(h.returnPct)} bold />
                    <TD ch="← fund XIRR" right small color="var(--text3)" />
                    <TD ch="" /><TD ch="" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
              XIRR = money-weighted return — accounts for exact timing of each purchase.
            </div>
          </>
        )}

        {tab === 'monthly' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr>
                  <TH ch="MONTH" /><TH ch="UNITS" right /><TH ch="AVG NAV" right />
                  <TH ch="INVESTED" right /><TH ch="VALUE" right /><TH ch="GAIN" right /><TH ch="RETURN" right />
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr key={i}>
                    <TD ch={m.month} mono color="var(--text2)" />
                    <TD ch={fmt(m.qty, 3)} right mono />
                    <TD ch={`₹${fmt(m.avgNav, 2)}`} right mono />
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
      </div>
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────
const SORTS = [
  { key: 'returnPct', label: 'Return' }, { key: 'cagr', label: 'CAGR' },
  { key: 'marketValue', label: 'Value' }, { key: 'gain', label: 'Gain' },
  { key: 'invested', label: 'Invested' }, { key: 'lots', label: 'Lots' },
];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MFView() {
  const { mfHoldings, stats, setActiveView } = usePortfolio();
  const [sort, setSort]         = useState({ key: 'returnPct', dir: -1 });
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState({});

  const categories = useMemo(() =>
    ['All', ...[...new Set(mfHoldings.map(h => h.sector || 'Other'))].sort()],
  [mfHoldings]);

  const rows = useMemo(() => {
    let list = category === 'All' ? [...mfHoldings] : mfHoldings.filter(h => (h.sector || 'Other') === category);
    const k = sort.key;
    list.sort((a, b) => sort.dir * ((k === 'lots' ? a.lots.length - b.lots.length : (a[k] ?? 0) - (b[k] ?? 0))));
    return list;
  }, [mfHoldings, category, sort]);

  const maxRet = useMemo(() => Math.max(...mfHoldings.map(h => Math.abs(h.returnPct)), 1), [mfHoldings]);
  const mfGain = stats.mfValue - stats.mfInvested;

  if (!mfHoldings.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'50vh', gap:12 }}>
      <div style={{ fontSize:40 }}>◎</div>
      <div style={{ fontSize:16, fontWeight:600 }}>No mutual funds yet</div>
      <button className="btn btn-primary" onClick={() => setActiveView('trade')}>+ Add MF Trade</button>
    </div>
  );

  function toggleSort(k) { setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 }); }
  function toggle(sym)    { setExpanded(e => ({ ...e, [sym]: !e[sym] })); }

  function exportCSV() {
    const rows2 = [['Fund','Category','Lots','Units','CMP','Avg NAV','Invested','Value','Gain','Return%','CAGR','Holding']];
    rows.forEach(h => rows2.push([h.symbol, h.sector||'', h.lots.length, fmt(h.qty,3), fmt(h.cmp,2), fmt(h.avgBuy,2), fmt(h.invested,0), fmt(h.marketValue,0), fmt(h.gain,0), fmt(h.returnPct,2)+'%', fmt(h.cagr,2)+'%', holdStr(h.holdingDays)]));
    const a = document.createElement('a'); a.href = 'data:text/csv,'+encodeURIComponent(rows2.map(r=>r.join(',')).join('\n')); a.download = 'mf.csv'; a.click();
  }

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
        {[
          { l:'MF Value',   v: fmtCr(stats.mfValue),     c:'var(--teal)' },
          { l:'Invested',   v: fmtCr(stats.mfInvested),  c:'var(--text)' },
          { l:'Gain',       v: fmtCr(mfGain),             c: colorPnl(mfGain) },
          { l:'Wtd CAGR',   v: pct(stats.mfCagr),         c:'var(--green2)' },
          { l:'Funds',      v: stats.fundCount,            c:'var(--accent2)' },
        ].map((m,i) => (
          <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'11px 14px' }}>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{m.l}</div>
            <div style={{ fontSize:18, fontWeight:700, fontFamily:'var(--font-mono)', color:m.c }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', flex:1, minWidth:0 }}>
          <span style={{ fontSize:9, fontWeight:700, color:'var(--text3)', letterSpacing:'0.07em', textTransform:'uppercase', flexShrink:0 }}>CATEGORY</span>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
              border: category===cat ? `1px solid ${cat==='All' ? 'var(--accent)' : sectorColor(cat)}` : '1px solid var(--border)',
              background: category===cat ? (cat==='All' ? 'var(--accent)' : sectorColor(cat)+'33') : 'var(--bg3)',
              color: category===cat ? (cat==='All' ? '#fff' : sectorColor(cat)) : 'var(--text2)',
            }}>{cat}</button>
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
          <button onClick={exportCSV} className="btn btn-ghost" style={{ padding:'3px 9px', fontSize:11 }}>↓ CSV</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
        <HeaderRow />
        {rows.map(h => {
          const open = !!expanded[h.symbol];
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
                <div style={{ textAlign:'center', color:'var(--text3)', fontSize:8, padding:'0 2px' }}>{open?'▼':'►'}</div>

                {/* Fund name */}
                <div style={{ padding:'9px 5px', minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={h.name||h.symbol}>{h.symbol}</div>
                  {h.name && h.name!==h.symbol && <div style={{ fontSize:9, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.name}</div>}
                </div>

                {/* Category badge */}
                <div style={{ padding:'9px 5px' }}>
                  <span style={{ fontSize:9, fontWeight:600, padding:'2px 5px', borderRadius:4, whiteSpace:'nowrap',
                    background:`${sectorColor(h.sector||'Other')}20`, color:sectorColor(h.sector||'Other'),
                    border:`1px solid ${sectorColor(h.sector||'Other')}40` }}>{h.sector||'Other'}</span>
                </div>

                {/* # lots */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text2)' }}>{h.lots.length}</div>

                {/* Units */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text2)' }}>{fmt(h.qty, 2)}</div>

                {/* CMP / NAV */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11 }}>₹{fmt(h.cmp, 1)}</div>

                {/* Invested */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11 }}>{fmtCr(h.invested)}</div>

                {/* Value */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:12, fontWeight:700 }}>{fmtCr(h.marketValue)}</div>

                {/* Gain */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600, color:colorPnl(h.gain) }}>{fmtCr(h.gain)}</div>

                {/* CAGR */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:pcol(h.cagr) }}>{pct(h.cagr)}</div>

                {/* Return bar */}
                <div style={{ padding:'9px 5px' }}><ReturnBar val={h.returnPct} max={maxRet} /></div>

                {/* Holding */}
                <div style={{ padding:'9px 5px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text2)' }}>{holdStr(h.holdingDays)}</div>
              </div>
              {open && <DetailPanel h={h} />}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'var(--text3)', fontSize:13 }}>No funds match the selected filter.</div>
        )}
      </div>
    </div>
  );
}
