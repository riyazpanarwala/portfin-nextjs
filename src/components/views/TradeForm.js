'use client';

import { useState, useEffect, useRef } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt } from '@/lib/store';

export function TradeForm() {
  const { addTrade, deleteTrade, trades, portfolioId } = usePortfolio();

  const [form, setForm] = useState({
    symbol: '', name: '', assetType: 'STOCK', exchange: 'NSE',
    tradeType: 'BUY', quantity: '', price: '', brokerage: '',
    tradeDate: new Date().toISOString().slice(0, 10), sector: '',
  });
  const [submitting, setSubmitting]   = useState(false);
  const [success, setSuccess]         = useState(false);
  const [deleteId, setDeleteId]       = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]         = useState(false);
  const [sugLoading, setSugLoading]   = useState(false);
  const debounceRef = useRef(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Autocomplete from instruments DB
  useEffect(() => {
    if (form.symbol.length < 1) { setSuggestions([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSugLoading(true);
      try {
        const res = await fetch(`/api/instruments?q=${encodeURIComponent(form.symbol)}&assetType=${form.assetType}&limit=8`);
        if (res.ok) {
          const { instruments } = await res.json();
          setSuggestions(instruments || []);
          setShowSug(true);
        }
      } catch { setSuggestions([]); }
      finally { setSugLoading(false); }
    }, 250);
  }, [form.symbol, form.assetType]);

  function pickSuggestion(inst) {
    setForm(f => ({
      ...f,
      symbol:    inst.symbol,
      name:      inst.name,
      assetType: inst.assetType,
      exchange:  inst.exchange,
      sector:    inst.sector || f.sector,
      price:     inst.price ? parseFloat(inst.price).toFixed(2) : f.price,
    }));
    setSuggestions([]);
    setShowSug(false);
  }

  async function handleSubmit() {
    if (!form.symbol || !form.quantity || !form.price || !form.tradeDate) return;
    setSubmitting(true);
    await addTrade({
      ...form,
      quantity:  parseFloat(form.quantity),
      price:     parseFloat(form.price),
      brokerage: form.brokerage ? parseFloat(form.brokerage) : undefined,
    });
    setSubmitting(false);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setForm(f => ({ ...f, symbol: '', name: '', quantity: '', price: '', brokerage: '', sector: '' }));
    }, 1800);
  }

  async function handleDelete(id) {
    setDeleteId(id);
    await deleteTrade(id);
    setDeleteId(null);
  }

  const recentTrades = [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).slice(0, 12);
  const txValue = form.quantity && form.price ? parseFloat(form.quantity) * parseFloat(form.price) : null;

  return (
    <div className="fade-up">
      <div className="grid-form-main" style={{ gap: '16px', alignItems: 'start' }}>

        {/* ── Form ── */}
        <div className="glass" style={{ padding: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>Record Trade</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '20px' }}>
            Add a buy or sell transaction · Instrument is auto-matched from NSE / AMFI database
          </div>

          {/* Asset type + Trade type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <Field label="Asset Type">
              <select value={form.assetType} onChange={e => {
                const at = e.target.value;
                set('assetType', at);
                set('exchange', at === 'MF' ? 'AMFI' : 'NSE');
                set('symbol', '');
                set('name', '');
              }}>
                <option value="STOCK">Equity / ETF (NSE/BSE)</option>
                <option value="MF">Mutual Fund (AMFI)</option>
              </select>
            </Field>
            <Field label="Trade Type">
              <select value={form.tradeType} onChange={e => set('tradeType', e.target.value)}>
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </Field>
          </div>

          {/* Symbol with autocomplete */}
          <Field label={form.assetType === 'MF' ? 'Fund Name' : 'NSE Symbol'}>
            <div style={{ position: 'relative' }}>
              <input
                value={form.symbol}
                onChange={e => { set('symbol', e.target.value.toUpperCase()); set('name', ''); }}
                onFocus={() => suggestions.length && setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 200)}
                placeholder={form.assetType === 'MF' ? 'e.g. ABSLVF (start typing name)' : 'e.g. INFY, BEL, SUZLON'}
                autoComplete="off"
              />
              {sugLoading && (
                <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text3)' }}>
                  searching…
                </div>
              )}
              {showSug && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: '240px', overflowY: 'auto', marginTop: '2px' }}>
                  {suggestions.map((inst, i) => (
                    <div key={i} onMouseDown={() => pickSuggestion(inst)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent2)' }}>{inst.symbol}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{inst.name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{inst.exchange}</div>
                        {inst.price && <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>₹{fmt(parseFloat(inst.price))}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {form.name && form.name !== form.symbol && (
              <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px', fontStyle: 'italic' }}>{form.name}</div>
            )}
          </Field>

          {/* Sector */}
          <Field label="Sector / Category">
            <input value={form.sector} onChange={e => set('sector', e.target.value)}
              placeholder={form.assetType === 'MF' ? 'e.g. Large Cap, ELSS' : 'e.g. Power, Defence'} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label={form.assetType === 'MF' ? 'Units' : 'Quantity'}>
              <input type="number" min="0" step="any" value={form.quantity}
                onChange={e => set('quantity', e.target.value)} placeholder="100" />
            </Field>
            <Field label={form.assetType === 'MF' ? 'NAV (₹)' : 'Price (₹)'}>
              <input type="number" min="0" step="any" value={form.price}
                onChange={e => set('price', e.target.value)} placeholder="500.00" />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Brokerage (₹, optional)">
              <input type="number" min="0" step="any" value={form.brokerage}
                onChange={e => set('brokerage', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Trade Date">
              <input type="date" value={form.tradeDate} onChange={e => set('tradeDate', e.target.value)} />
            </Field>
          </div>

          {txValue != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Transaction value</span>
              <span style={{ fontSize: '15px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>{fmtCr(txValue)}</span>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !form.symbol || !form.quantity || !form.price}
            style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '14px', opacity: (!form.symbol || !form.quantity || !form.price || submitting) ? 0.6 : 1 }}
          >
            {submitting ? '⏳ Saving…' : success ? '✅ Saved!' : `${form.tradeType === 'BUY' ? '📈 Buy' : '📉 Sell'} — Record Trade`}
          </button>
        </div>

        {/* ── Recent trades ── */}
        <div className="glass" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Recent Trades</span>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{trades.length} total</span>
          </div>
          {recentTrades.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
              No trades yet. Add your first trade above.
            </div>
          ) : recentTrades.map((t, i) => (
            <div key={t.id} style={{ padding: '10px 18px', borderBottom: '1px solid rgba(45,64,96,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span className={`chip ${t.tradeType === 'BUY' ? 'chip-green' : 'chip-red'}`} style={{ flexShrink: 0 }}>{t.tradeType}</span>
                <span className={`chip ${t.assetType === 'MF' ? 'chip-blue' : 'chip-purple'}`} style={{ flexShrink: 0 }}>{t.assetType}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={t.name || t.symbol}>
                    {t.symbol}
                    {t.name && t.name !== t.symbol && <span style={{ fontWeight: '400', color: 'var(--text3)', marginLeft: '4px', fontSize: '11px' }}>{t.name.slice(0, 28)}</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.tradeDate} · {parseFloat(t.quantity)} × ₹{fmt(parseFloat(t.price), 1)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text2)' }}>
                  {fmtCr(parseFloat(t.quantity) * parseFloat(t.price))}
                </div>
                <button onClick={() => handleDelete(t.id)} disabled={deleteId === t.id}
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red2)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', opacity: deleteId === t.id ? 0.4 : 1, flexShrink: 0 }}>
                  {deleteId === t.id ? '…' : '✕'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  );
}
