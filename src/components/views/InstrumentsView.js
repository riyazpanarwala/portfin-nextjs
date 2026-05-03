'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';

// ── constants ─────────────────────────────────────────────────────────────────
const EXCHANGES  = ['NSE', 'BSE', 'AMFI'];
const ASSET_TYPES = ['STOCK', 'MF'];
const exchColors  = { NSE: 'var(--green2)', BSE: 'var(--orange)', AMFI: 'var(--teal)' };
const typeColors  = { STOCK: 'var(--purple)', MF: 'var(--accent2)' };

const SECTOR_SUGGESTIONS = [
  'Large Cap','Mid Cap','Small Cap','Flexi Cap','ELSS','Value',
  'Diversified','Banking','IT','Energy','Power','Defence',
  'FMCG','Finance','Metals & Mining','Construction',
  'Renewable Energy','Index ETF','Commodities ETF','Pharma',
];

// ── CSV parsers (used by BulkImportPanel) ─────────────────────────────────────
function parseBSE(text) {
  const lines = text.split('\n'); const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(',');
    if (cols.length < 8) continue;
    const symbol = cols[2]?.trim(), name = cols[1]?.trim(), isin = cols[7]?.trim();
    if (!symbol) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'BSE', assetType: 'STOCK' });
  }
  return results;
}
function parseNSE(text) {
  const lines = text.split('\n'); const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(',');
    if (cols.length < 7) continue;
    const symbol = cols[0]?.trim(), name = cols[1]?.trim(), isin = cols[6]?.trim();
    if (!symbol) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'NSE', assetType: 'STOCK' });
  }
  return results;
}
function parseETF(text) {
  const lines = text.split('\n'); const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(',');
    if (cols.length < 6) continue;
    const symbol = cols[0]?.trim(), name = cols[2]?.trim(), isin = cols[5]?.trim();
    if (!symbol) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'NSE', assetType: 'STOCK', sector: 'Index ETF' });
  }
  return results;
}
function detectFileType(filename, text) {
  const fn = filename.toLowerCase();
  if (fn.includes('bse')) return 'bse';
  if (fn.includes('etf')) return 'etf';
  if (fn.includes('nse')) return 'nse';
  const h = text.slice(0, 200).toLowerCase();
  if (h.includes('security id') || h.includes('security code')) return 'bse';
  if (h.includes('underlying')) return 'etf';
  return 'nse';
}

// ── shared UI atoms ───────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = 'var(--accent)' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
    </div>
  );
}

function Badge({ label, color = 'var(--accent2)', bg = 'rgba(59,130,246,0.12)', border = 'rgba(59,130,246,0.25)' }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: bg, color, border: `1px solid ${border}`, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', display: 'block' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(148,169,196,0.3)" strokeWidth="2.5" />
      <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="var(--accent2)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Symbol Search Dropdown ─────────────────────────────────────────────────────
function SymbolSearchDropdown({ exchange, assetType, onSelect, disabled }) {
  const [query, setQuery]         = useState('');
  const [suggestions, setSugs]    = useState([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounce   = useRef(null);
  const inputRef   = useRef(null);

  // Reset when type/exchange changes
  useEffect(() => {
    setQuery(''); setSugs([]); setSelected(null); setOpen(false);
  }, [assetType, exchange]);

  // Search on keystroke
  useEffect(() => {
    if (query.length < 1) { setSugs([]); setOpen(false); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        let url;
        if (assetType === 'MF') {
          url = `/api/instruments?q=${encodeURIComponent(query)}&assetType=MF&limit=12`;
        } else {
          const p = new URLSearchParams({ q: query, limit: '12', exchange });
          url = `/api/instruments/search?${p}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list = data.instruments || [];
        setSugs(list);
        setOpen(list.length > 0);
        setActiveIdx(-1);
      } catch { setSugs([]); }
      finally { setLoading(false); }
    }, 220);
  }, [query, exchange, assetType]);

  async function pickSuggestion(inst) {
    setQuery(inst.symbol);
    setOpen(false);
    setSugs([]);

    // Enrich with Yahoo Finance sector if missing
    if (!inst.sector && inst.assetType === 'STOCK' && ['NSE','BSE'].includes(inst.exchange)) {
      setEnriching(true);
      try {
        const res = await fetch(
          `/api/instruments/search?q=${encodeURIComponent(inst.symbol)}&exchange=${inst.exchange}&enrich=true&limit=1`
        );
        if (res.ok) {
          const data = await res.json();
          const enriched = data.instruments?.[0];
          if (enriched) inst = { ...inst, ...enriched };
        }
      } catch { /* ignore */ }
      setEnriching(false);
    }

    setSelected(inst);
    onSelect(inst);
  }

  function handleKeyDown(e) {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeIdx]); }
    if (e.key === 'Escape')    { setOpen(false); setActiveIdx(-1); }
  }

  function clear() {
    setQuery(''); setSelected(null); setSugs([]); setOpen(false);
    onSelect(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function highlight(text, q) {
    if (!q || q.length < 1 || !text) return text;
    const idx = text.toUpperCase().indexOf(q.toUpperCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: 'var(--accent2)', fontWeight: 800 }}>{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  const ec = exchColors[exchange] || 'var(--text2)';

  return (
    <div style={{ position: 'relative' }}>

      {/* Input box */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg3)',
        border: `1px solid ${selected ? ec : open ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8, overflow: 'visible', transition: 'border-color 0.2s',
      }}>
        {/* Exchange pill */}
        <span style={{
          padding: '0 10px', fontSize: 10, fontWeight: 700, color: ec,
          borderRight: '1px solid var(--border)', height: '100%',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          background: `${ec}12`, minHeight: 38,
        }}>{exchange}</span>

        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value.toUpperCase()); setSelected(null); onSelect(null); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onKeyDown={handleKeyDown}
          placeholder={assetType === 'MF' ? 'Type fund name or scheme code…' : 'Type symbol or company name…'}
          disabled={disabled}
          autoComplete="off"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text)', fontFamily: 'var(--font-main)', fontSize: 13,
            padding: '9px 10px',
          }}
        />

        <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {loading    && <Spinner />}
          {enriching  && <span style={{ fontSize: 10, color: 'var(--accent2)', whiteSpace: 'nowrap' }}>✦ fetching sector…</span>}
          {selected && !enriching && (
            <button onClick={clear} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: 0,
            }} title="Clear selection">✕</button>
          )}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          maxHeight: 360, overflowY: 'auto', marginTop: 4,
        }}>
          {/* Dropdown header */}
          <div style={{
            padding: '6px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg3)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              {suggestions.length} results for "{query}"
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {suggestions.some(s => s.inDb) && (
                <Badge label="● In DB" color="var(--green2)" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.25)" />
              )}
              {suggestions.some(s => !s.inDb) && (
                <Badge label="○ From CSV" color="var(--text3)" bg="var(--bg3)" border="var(--border)" />
              )}
            </div>
          </div>

          {suggestions.map((inst, i) => {
            const iec     = exchColors[inst.exchange] || 'var(--text2)';
            const isActive = i === activeIdx;
            return (
              <div
                key={`${inst.symbol}:${inst.exchange}:${i}`}
                onMouseDown={() => pickSuggestion(inst)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: i < suggestions.length - 1 ? '1px solid rgba(45,64,96,0.3)' : 'none',
                  background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
                  display: 'flex', gap: 10, alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Exchange color bar */}
                <div style={{ width: 3, borderRadius: 2, background: iec, alignSelf: 'stretch', flexShrink: 0, opacity: 0.85 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Line 1: symbol + badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: iec }}>
                      {highlight(inst.symbol, query)}
                    </span>
                    <Badge label={inst.exchange} color={iec} bg={`${iec}15`} border={`${iec}30`} />
                    <Badge
                      label={inst.assetType}
                      color={typeColors[inst.assetType] || 'var(--text2)'}
                      bg={`${typeColors[inst.assetType] || '#999'}15`}
                      border={`${typeColors[inst.assetType] || '#999'}30`}
                    />
                    {inst.inDb && <Badge label="✓ In DB" color="var(--green2)" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.25)" />}
                    {inst.sector && (
                      <Badge label={inst.sector} color="var(--text2)" bg="var(--bg3)" border="var(--border)" />
                    )}
                  </div>
                  {/* Line 2: full name */}
                  <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {highlight(inst.name, query.length > 3 ? query : '')}
                  </div>
                  {/* Line 3: ISIN + price */}
                  {(inst.isin || inst.price) && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                      {inst.isin && (
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{inst.isin}</span>
                      )}
                      {inst.price && (
                        <span style={{ fontSize: 10, color: 'var(--green2)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          ₹{parseFloat(inst.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <span style={{ fontSize: 18, color: 'var(--text3)', flexShrink: 0, opacity: 0.4 }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* No results message */}
      {open && !loading && suggestions.length === 0 && query.length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '18px 16px', textAlign: 'center', marginTop: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 18, marginBottom: 5 }}>🔍</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>No results for "{query}"</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
            Try a different symbol or fill in the fields below manually.
          </div>
        </div>
      )}

      {/* Selected instrument confirmation card */}
      {selected && !open && (
        <div style={{
          marginTop: 8, padding: '12px 14px', borderRadius: 10,
          background: `${exchColors[selected.exchange] || 'var(--accent)'}0d`,
          border: `1px solid ${exchColors[selected.exchange] || 'var(--accent)'}35`,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 4, borderRadius: 2,
            background: exchColors[selected.exchange] || 'var(--accent)',
            alignSelf: 'stretch', flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 15, color: exchColors[selected.exchange] }}>
                {selected.symbol}
              </span>
              <Badge label={selected.exchange} color={exchColors[selected.exchange]} bg={`${exchColors[selected.exchange]}15`} border={`${exchColors[selected.exchange]}30`} />
              <Badge label={selected.assetType} color={typeColors[selected.assetType]} bg={`${typeColors[selected.assetType]}15`} border={`${typeColors[selected.assetType]}30`} />
              {selected.inDb && <Badge label="✓ Already in DB" color="var(--green2)" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.25)" />}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>{selected.name}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {selected.isin     && <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>ISIN: {selected.isin}</span>}
              {selected.sector   && <span style={{ fontSize: 11, color: 'var(--accent2)' }}>Sector: {selected.sector}</span>}
              {selected.industry && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Industry: {selected.industry}</span>}
              {selected.price    && <span style={{ fontSize: 11, color: 'var(--green2)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>₹{parseFloat(selected.price).toFixed(2)}</span>}
            </div>
          </div>
          <div style={{ fontSize: 22, color: 'var(--green2)', flexShrink: 0, marginTop: 2 }}>✓</div>
        </div>
      )}
    </div>
  );
}

// ── Add Single Instrument Form ─────────────────────────────────────────────────
function AddInstrumentForm({ onAdded }) {
  const { toast }   = usePortfolio();
  const [assetType, setAssetType] = useState('STOCK');
  const [exchange,  setExchange]  = useState('NSE');
  const [form, setForm] = useState({ symbol: '', name: '', isin: '', sector: '' });
  const [saving, setSaving]       = useState(false);
  const [sectorOpen, setSectorOpen] = useState(false);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleAssetTypeChange(at) {
    setAssetType(at);
    setExchange(at === 'MF' ? 'AMFI' : 'NSE');
    setForm({ symbol: '', name: '', isin: '', sector: '' });
  }

  function handleSelect(inst) {
    if (!inst) { setForm({ symbol: '', name: '', isin: '', sector: '' }); return; }
    setExchange(inst.exchange || exchange);
    setForm({
      symbol: inst.symbol   || '',
      name:   inst.name     || '',
      isin:   inst.isin     || '',
      sector: inst.sector   || inst.industry || '',
    });
  }

  async function handleSubmit() {
    if (!form.symbol) return;
    setSaving(true);
    try {
      const res = await fetch('/api/instruments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruments: [{ symbol: form.symbol.toUpperCase().trim(), name: form.name || form.symbol, isin: form.isin || null, exchange, assetType, sector: form.sector || null }] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(data.created > 0 ? `✅ ${form.symbol} added to database` : `ℹ ${form.symbol} updated`, 'green');
      setForm({ symbol: '', name: '', isin: '', sector: '' });
      setAssetType('STOCK'); setExchange('NSE');
      onAdded?.();
    } catch (e) {
      toast(e.message, 'red');
    } finally { setSaving(false); }
  }

  const Label = ({ ch, hint }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{ch}</label>
      {hint && <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>{hint}</span>}
    </div>
  );

  return (
    <div className="glass" style={{ padding: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>➕ Add Single Instrument</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.7 }}>
        Search by symbol, company name, or ISIN — details auto-fill from NSE / BSE / ETF data.
        Sector &amp; industry enriched live from Yahoo Finance on exact match.
      </div>

      {/* Asset type selector */}
      <div style={{ marginBottom: 14 }}>
        <Label ch="Asset Type" />
        <div style={{ display: 'flex', gap: 8 }}>
          {[['STOCK', '📈', 'Stock / ETF'], ['MF', '📊', 'Mutual Fund']].map(([val, icon, label]) => (
            <button key={val} onClick={() => handleAssetTypeChange(val)} style={{
              flex: 1, padding: '9px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', border: `1px solid ${assetType === val ? 'var(--accent)' : 'var(--border)'}`,
              background: assetType === val ? 'rgba(59,130,246,0.15)' : 'var(--bg3)',
              color: assetType === val ? 'var(--accent2)' : 'var(--text3)',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      {/* Exchange selector (STOCK only) */}
      {assetType === 'STOCK' && (
        <div style={{ marginBottom: 14 }}>
          <Label ch="Exchange" />
          <div style={{ display: 'flex', gap: 8 }}>
            {['NSE', 'BSE'].map(ex => {
              const ec = exchColors[ex];
              return (
                <button key={ex} onClick={() => setExchange(ex)} style={{
                  flex: 1, padding: '9px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', border: `1px solid ${exchange === ex ? ec : 'var(--border)'}`,
                  background: exchange === ex ? `${ec}18` : 'var(--bg3)',
                  color: exchange === ex ? ec : 'var(--text3)',
                  transition: 'all 0.15s',
                }}>{ex}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Symbol search dropdown */}
      <div style={{ marginBottom: 16 }}>
        <Label ch="Search Symbol / Name / ISIN" hint="— auto-fills all fields on selection" />
        <SymbolSearchDropdown
          exchange={exchange}
          assetType={assetType}
          onSelect={handleSelect}
          disabled={saving}
        />
      </div>

      {/* Editable detail fields */}
      <div style={{
        padding: 14, borderRadius: 10, marginBottom: 14,
        background: form.symbol ? 'rgba(59,130,246,0.04)' : 'var(--bg3)',
        border: `1px solid ${form.symbol ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
        transition: 'all 0.2s',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          {form.symbol ? '✏️ Review & Edit — fields auto-filled from search' : '✏️ Or enter details manually'}
        </div>

        <div style={{ marginBottom: 10 }}>
          <Label ch="Full Name / Scheme Name" />
          <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. Infosys Limited" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label ch="ISIN" hint="— optional" />
            <input
              value={form.isin}
              onChange={e => setF('isin', e.target.value.toUpperCase())}
              placeholder="INE009A01021"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Label ch="Sector / Category" hint="— optional" />
            <input
              value={form.sector}
              onChange={e => { setF('sector', e.target.value); setSectorOpen(true); }}
              onFocus={() => setSectorOpen(true)}
              onBlur={() => setTimeout(() => setSectorOpen(false), 160)}
              placeholder="e.g. Banking, Large Cap"
            />
            {sectorOpen && !form.sector && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)', maxHeight: 200, overflowY: 'auto', marginTop: 2,
              }}>
                {SECTOR_SUGGESTIONS.map((s, i) => (
                  <div key={i} onMouseDown={() => { setF('sector', s); setSectorOpen(false); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', borderBottom: i < SECTOR_SUGGESTIONS.length - 1 ? '1px solid rgba(45,64,96,0.3)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >{s}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview pill */}
      {form.symbol && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Saving as:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: exchColors[exchange], fontSize: 13 }}>{form.symbol}</span>
          <Badge label={exchange} color={exchColors[exchange]} bg={`${exchColors[exchange]}15`} border={`${exchColors[exchange]}30`} />
          <Badge label={assetType} color={typeColors[assetType]} bg={`${typeColors[assetType]}15`} border={`${typeColors[assetType]}30`} />
          {form.isin   && <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{form.isin}</span>}
          {form.sector && <span style={{ fontSize: 10, color: 'var(--accent2)' }}>{form.sector}</span>}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={saving || !form.symbol}
        style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 13, opacity: (!form.symbol || saving) ? 0.5 : 1 }}
      >
        {saving ? '⏳ Saving…' : `➕ Add ${form.symbol || 'Instrument'} to Database`}
      </button>
    </div>
  );
}

// ── Bulk Import Panel ─────────────────────────────────────────────────────────
function BulkImportPanel({ onImported }) {
  const { toast }   = usePortfolio();
  const [files, setFiles]         = useState([]);
  const [parsed, setParsed]       = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const inputRef = useRef(null);

  async function readFiles(fileList) {
    const fileArr = Array.from(fileList);
    setFiles(fileArr.map(f => ({ name: f.name, size: f.size, status: 'parsing' })));
    setResult(null); setProgress(0);
    const all = [], updated = [];
    for (const f of fileArr) {
      const text = await f.text();
      const type = detectFileType(f.name, text);
      const instruments = type === 'bse' ? parseBSE(text) : type === 'etf' ? parseETF(text) : parseNSE(text);
      all.push(...instruments);
      updated.push({ name: f.name, size: f.size, status: 'ready', count: instruments.length, type });
    }
    setFiles(updated);
    setParsed(all);
  }

  async function handleImport() {
    if (!parsed.length) return;
    setImporting(true); setProgress(0); setResult(null);
    const CHUNK = 200;
    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, allErrors = [];
    for (let i = 0; i < parsed.length; i += CHUNK) {
      try {
        const res = await fetch('/api/instruments/bulk', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments: parsed.slice(i, i + CHUNK) }),
        });
        const d = await res.json();
        totalCreated += d.created || 0; totalUpdated += d.updated || 0; totalSkipped += d.skipped || 0;
        allErrors = [...allErrors, ...(d.errors || [])];
      } catch { totalSkipped += CHUNK; }
      setProgress(Math.min(100, Math.round(((i + CHUNK) / parsed.length) * 100)));
    }
    setResult({ created: totalCreated, updated: totalUpdated, skipped: totalSkipped, errors: allErrors });
    setImporting(false);
    toast(`Import done — ${totalCreated} new, ${totalUpdated} updated`, 'green');
    onImported?.();
  }

  const typeColor = { bse: 'var(--orange)', nse: 'var(--green2)', etf: 'var(--accent2)' };
  const typeLabel = { bse: 'BSE Equity', nse: 'NSE Equity', etf: 'NSE ETF' };

  return (
    <div className="glass" style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>📂 Bulk Import from CSV</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
        Upload BSE, NSE or ETF CSV files. File type is auto-detected. Duplicates are updated, not duplicated.
      </div>

      {/* Drop zone */}
      <div
        onDrop={e => { e.preventDefault(); setDragOver(false); readFiles(e.dataTransfer.files); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius: 10, padding: '22px 20px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'rgba(59,130,246,0.06)' : 'var(--bg3)', transition: 'all 0.2s', marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 6 }}>📄</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Drop CSV files here or click to browse</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>bse_equity.csv · nse_equity.csv · ETF_list.csv</div>
        <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: 'none' }} onChange={e => readFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{(f.size / 1024).toFixed(0)} KB</div>
              </div>
              {f.count != null && <Badge label={`${f.count.toLocaleString()} · ${typeLabel[f.type] || f.type}`} color={typeColor[f.type] || 'var(--text2)'} bg={`${typeColor[f.type] || '#999'}18`} border={`${typeColor[f.type] || '#999'}30`} />}
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textAlign: 'right' }}>
            Total: {parsed.length.toLocaleString()} instruments ready
          </div>
        </div>
      )}

      {importing && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--text3)' }}>
            <span>Importing…</span><span>{progress}%</span>
          </div>
          <ProgressBar value={progress} max={100} color="var(--green2)" />
        </div>
      )}

      {result && (
        <div style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green2)', marginBottom: 8 }}>✅ Import Complete</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[['New', result.created,'var(--green2)'],['Updated', result.updated,'var(--accent2)'],['Skipped', result.skipped,'var(--text3)']].map(([l,v,c]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: c }}>{v.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{l}</div>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--red2)' }}>
              {result.errors.slice(0,3).join(' · ')}{result.errors.length > 3 ? ` +${result.errors.length-3} more` : ''}
            </div>
          )}
        </div>
      )}

      <button className="btn btn-primary" onClick={handleImport} disabled={importing || parsed.length === 0}
        style={{ width: '100%', justifyContent: 'center', opacity: (importing || parsed.length === 0) ? 0.6 : 1 }}>
        {importing ? `⏳ Importing… ${progress}%` : `⬆ Import ${parsed.length.toLocaleString()} Instruments`}
      </button>
    </div>
  );
}

// ── Data Sources Help ──────────────────────────────────────────────────────────
function DataSourcesHelp() {
  return (
    <div className="glass" style={{ padding: 16, background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)', marginBottom: 8 }}>📥 Download Official CSV Files</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { label: 'NSE Equity List',   url: 'https://archives.nseindia.com/content/equities/EQUITY_L.csv', badge: 'NSE', color: 'var(--green2)' },
          { label: 'BSE Equity List',   url: 'https://www.bseindia.com/corporates/List_Scrips.aspx',        badge: 'BSE', color: 'var(--orange)' },
          { label: 'NSE ETF List',      url: 'https://archives.nseindia.com/content/equities/eq_etfseclist.csv', badge: 'ETF', color: 'var(--accent2)' },
          { label: 'AMFI Fund NAVAll',  url: 'https://portal.amfiindia.com/spages/NAVAll.txt',              badge: 'AMFI', color: 'var(--teal)' },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <Badge label={s.badge} color={s.color} bg={`${s.color}18`} border={`${s.color}30`} />
            <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{s.label}</span>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent2)', textDecoration: 'none', fontWeight: 600 }}>Open ↗</a>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text3)', lineHeight: 1.7 }}>
        Download then drag into Bulk Import. File type is auto-detected from filename or column headers.
      </div>
    </div>
  );
}

// ── Instrument Browser Table ───────────────────────────────────────────────────
function InstrumentTable({ refresh }) {
  const { toast }   = usePortfolio();
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [assetFilter, setAssetFilter] = useState('');
  const [page, setPage]               = useState(1);
  const [deleting, setDeleting]       = useState(null);
  const PAGE_SIZE = 20;
  const debounce  = useRef(null);

  const load = useCallback(async (q, at, p) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (p-1)*PAGE_SIZE });
      if (q) params.set('q', q);
      if (at) params.set('assetType', at);
      const res = await fetch(`/api/instruments?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInstruments(data.instruments || []);
    } catch { setInstruments([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); load(query, assetFilter, 1); }, 250);
  }, [query, assetFilter, load, refresh]);

  useEffect(() => { load(query, assetFilter, page); }, [page]);

  async function handleDelete(inst) {
    if (!confirm(`Delete "${inst.symbol}" (${inst.exchange})?\nFails if trades reference it.`)) return;
    setDeleting(inst.id);
    try {
      const res = await fetch('/api/instruments/bulk', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inst.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast(`${inst.symbol} deleted`, 'blue');
      load(query, assetFilter, page);
    } catch (e) { toast(e.message, 'red'); }
    finally { setDeleting(null); }
  }

  return (
    <div className="glass" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search symbol or name…" style={{ flex: 1, minWidth: 160, maxWidth: 300 }} />
        <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} style={{ width: 130 }}>
          <option value="">All Types</option>
          {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
          {loading ? 'Loading…' : `${instruments.length} results`}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Symbol</th><th>Name</th><th>Exchange</th><th>Type</th><th>Sector</th><th>ISIN</th><th>Price</th><th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {instruments.map(inst => (
              <tr key={inst.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)' }}>{inst.symbol}</td>
                <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inst.name}>{inst.name}</td>
                <td><Badge label={inst.exchange} color={exchColors[inst.exchange]||'var(--text2)'} bg={`${exchColors[inst.exchange]||'#999'}15`} border={`${exchColors[inst.exchange]||'#999'}30`} /></td>
                <td><Badge label={inst.assetType} color={typeColors[inst.assetType]||'var(--text2)'} bg={`${typeColors[inst.assetType]||'#999'}15`} border={`${typeColors[inst.assetType]||'#999'}30`} /></td>
                <td style={{ fontSize: 11, color: 'var(--text3)' }}>{inst.sector || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{inst.isin || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: inst.price ? 'var(--green2)' : 'var(--text3)' }}>
                  {inst.price ? `₹${parseFloat(inst.price).toFixed(2)}` : '—'}
                </td>
                <td>
                  <button onClick={() => handleDelete(inst)} disabled={deleting === inst.id}
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red2)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, opacity: deleting === inst.id ? 0.4 : 0.7 }}>
                    {deleting === inst.id ? '…' : '✕'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && instruments.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>No instruments found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>← Prev</button>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Page {page}</span>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setPage(p => p+1)} disabled={instruments.length < PAGE_SIZE}>Next →</button>
      </div>
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────
export default function InstrumentsView() {
  const [tableRefresh, setTableRefresh] = useState(0);
  const refresh = () => setTableRefresh(n => n + 1);

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10 }}>
        {[
          { icon: '🏛', label: 'NSE Equities', desc: '2,360+ listed stocks',   color: 'var(--green2)' },
          { icon: '📊', label: 'BSE Equities', desc: '4,800+ listed stocks',   color: 'var(--orange)' },
          { icon: '💼', label: 'ETFs',          desc: '320+ index & thematic', color: 'var(--accent2)' },
          { icon: '📈', label: 'Mutual Funds',  desc: 'All AMFI schemes',      color: 'var(--teal)' },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: m.color, marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <AddInstrumentForm onAdded={refresh} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BulkImportPanel onImported={refresh} />
          <DataSourcesHelp />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>🔍 Instrument Browser</div>
        <InstrumentTable refresh={tableRefresh} />
      </div>

    </div>
  );
}
