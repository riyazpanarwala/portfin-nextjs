'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';

// ── helpers ───────────────────────────────────────────────────────────────────
const EXCHANGES = ['NSE', 'BSE', 'AMFI'];
const ASSET_TYPES = ['STOCK', 'MF'];

function parseBSE(text) {
  const lines = text.split('\n');
  const results = [];
  // skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 8) continue;
    const symbol = cols[2]?.trim();
    const name   = cols[1]?.trim();
    const isin   = cols[7]?.trim();
    if (!symbol || symbol.length < 1) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'BSE', assetType: 'STOCK' });
  }
  return results;
}

function parseNSE(text) {
  const lines = text.split('\n');
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 7) continue;
    const symbol = cols[0]?.trim();
    const name   = cols[1]?.trim();
    const isin   = cols[6]?.trim();
    if (!symbol) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'NSE', assetType: 'STOCK' });
  }
  return results;
}

function parseETF(text) {
  const lines = text.split('\n');
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 6) continue;
    const symbol = cols[0]?.trim();
    const name   = cols[2]?.trim();
    const isin   = cols[5]?.trim();
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
  // Try to detect by header
  const header = text.slice(0, 200).toLowerCase();
  if (header.includes('security id') || header.includes('security code')) return 'bse';
  if (header.includes('underlying') || header.includes('isin')) return 'etf';
  return 'nse';
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = 'var(--accent)' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
    </div>
  );
}

// ── Tag badge ─────────────────────────────────────────────────────────────────
function Badge({ label, color = 'var(--accent2)', bg = 'rgba(59,130,246,0.12)', border = 'rgba(59,130,246,0.25)' }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bg, color, border: `1px solid ${border}`, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ── Single Instrument Add Form ────────────────────────────────────────────────
function AddInstrumentForm({ onAdded }) {
  const { toast } = usePortfolio();
  const [form, setForm] = useState({ symbol: '', name: '', isin: '', exchange: 'NSE', assetType: 'STOCK', sector: '' });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit() {
    if (!form.symbol || !form.exchange || !form.assetType) return;
    setSaving(true);
    try {
      const res = await fetch('/api/instruments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruments: [{
          symbol: form.symbol.toUpperCase().trim(),
          name: form.name || form.symbol.toUpperCase().trim(),
          isin: form.isin || null,
          exchange: form.exchange,
          assetType: form.assetType,
          sector: form.sector || null,
        }] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(data.created > 0 ? `✅ ${form.symbol.toUpperCase()} added` : `ℹ Updated existing instrument`, 'green');
      setForm({ symbol: '', name: '', isin: '', exchange: 'NSE', assetType: 'STOCK', sector: '' });
      onAdded?.();
    } catch (e) {
      toast(e.message, 'red');
    } finally {
      setSaving(false);
    }
  }

  const Label = ({ ch }) => (
    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{ch}</label>
  );

  return (
    <div className="glass" style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>➕ Add Single Instrument</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>Manually add any stock, ETF, or mutual fund to the instrument database.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <Label ch="Asset Type" />
          <select value={form.assetType} onChange={e => { set('assetType', e.target.value); set('exchange', e.target.value === 'MF' ? 'AMFI' : 'NSE'); }}>
            <option value="STOCK">Stock / ETF</option>
            <option value="MF">Mutual Fund</option>
          </select>
        </div>
        <div>
          <Label ch="Exchange" />
          <select value={form.exchange} onChange={e => set('exchange', e.target.value)}>
            {EXCHANGES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Label ch="Symbol / Scheme Code *" />
        <input value={form.symbol} onChange={e => set('symbol', e.target.value.toUpperCase())} placeholder="e.g. INFY, HDFCBANK, PPFAS" />
      </div>

      <div style={{ marginTop: 12 }}>
        <Label ch="Full Name" />
        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Infosys Limited" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div>
          <Label ch="ISIN (optional)" />
          <input value={form.isin} onChange={e => set('isin', e.target.value.toUpperCase())} placeholder="INE009A01021" />
        </div>
        <div>
          <Label ch="Sector / Category (optional)" />
          <input value={form.sector} onChange={e => set('sector', e.target.value)} placeholder="e.g. Banking, Large Cap" />
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={saving || !form.symbol}
        style={{ width: '100%', justifyContent: 'center', marginTop: 16, opacity: (!form.symbol || saving) ? 0.6 : 1 }}
      >
        {saving ? '⏳ Saving…' : '➕ Add Instrument'}
      </button>
    </div>
  );
}

// ── CSV Bulk Import Panel ─────────────────────────────────────────────────────
function BulkImportPanel({ onImported }) {
  const { toast } = usePortfolio();
  const [files, setFiles]         = useState([]);
  const [parsed, setParsed]       = useState([]); // flat list of instruments
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const inputRef = useRef(null);

  async function readFiles(fileList) {
    const fileArr = Array.from(fileList);
    setFiles(fileArr.map(f => ({ name: f.name, size: f.size, status: 'parsing' })));
    setResult(null);
    setProgress(0);

    const all = [];
    const updated = [];

    for (let i = 0; i < fileArr.length; i++) {
      const f = fileArr[i];
      const text = await f.text();
      const type = detectFileType(f.name, text);
      let instruments = [];
      if (type === 'bse')      instruments = parseBSE(text);
      else if (type === 'etf') instruments = parseETF(text);
      else                     instruments = parseNSE(text);
      all.push(...instruments);
      updated.push({ name: f.name, size: f.size, status: 'ready', count: instruments.length, type });
    }

    setFiles(updated);
    setParsed(all);
  }

  async function handleImport() {
    if (!parsed.length) return;
    setImporting(true);
    setProgress(0);
    setResult(null);

    const CHUNK = 200;
    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, allErrors = [];

    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      try {
        const res = await fetch('/api/instruments/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments: chunk }),
        });
        const data = await res.json();
        totalCreated  += data.created  || 0;
        totalUpdated  += data.updated  || 0;
        totalSkipped  += data.skipped  || 0;
        allErrors = [...allErrors, ...(data.errors || [])];
      } catch (e) {
        totalSkipped += chunk.length;
      }
      setProgress(Math.min(100, Math.round(((i + CHUNK) / parsed.length) * 100)));
    }

    setResult({ created: totalCreated, updated: totalUpdated, skipped: totalSkipped, errors: allErrors });
    setImporting(false);
    toast(`Import done — ${totalCreated} new, ${totalUpdated} updated`, 'green');
    onImported?.();
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    readFiles(e.dataTransfer.files);
  }

  const typeColors = { bse: 'var(--orange)', nse: 'var(--green2)', etf: 'var(--accent2)' };
  const typeLabels = { bse: 'BSE Equity', nse: 'NSE Equity', etf: 'NSE ETF' };

  return (
    <div className="glass" style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>📂 Bulk Import from CSV</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
        Upload BSE equity, NSE equity, or ETF list CSV files. Auto-detects file type from filename/headers.
        Duplicate instruments are updated, not duplicated.
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'rgba(59,130,246,0.06)' : 'var(--bg3)',
          transition: 'all 0.2s', marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Drop CSV files here or click to browse</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Supports: <strong>bse_equity.csv</strong>, <strong>nse_equity.csv</strong>, <strong>ETF_list.csv</strong> · Multiple files OK
        </div>
        <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: 'none' }}
          onChange={e => readFiles(e.target.files)} />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{(f.size / 1024).toFixed(0)} KB</div>
              </div>
              {f.count != null && (
                <Badge
                  label={`${f.count.toLocaleString()} rows · ${typeLabels[f.type] || f.type}`}
                  color={typeColors[f.type] || 'var(--text2)'}
                  bg={`${typeColors[f.type] || '#999'}18`}
                  border={`${typeColors[f.type] || '#999'}30`}
                />
              )}
              {f.status === 'parsing' && <span style={{ fontSize: 10, color: 'var(--text3)' }}>Parsing…</span>}
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textAlign: 'right' }}>
            Total: {parsed.length.toLocaleString()} instruments ready to import
          </div>
        </div>
      )}

      {/* Progress */}
      {importing && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--text3)' }}>
            <span>Importing…</span><span>{progress}%</span>
          </div>
          <ProgressBar value={progress} max={100} color="var(--green2)" />
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green2)', marginBottom: 8 }}>✅ Import Complete</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'New', value: result.created, color: 'var(--green2)' },
              { label: 'Updated', value: result.updated, color: 'var(--accent2)' },
              { label: 'Skipped', value: result.skipped, color: 'var(--text3)' },
            ].map((m, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: m.color }}>{m.value.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{m.label}</div>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--red2)' }}>
              {result.errors.slice(0, 3).join(' · ')}
              {result.errors.length > 3 && ` … +${result.errors.length - 3} more`}
            </div>
          )}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleImport}
        disabled={importing || parsed.length === 0}
        style={{ width: '100%', justifyContent: 'center', opacity: (importing || parsed.length === 0) ? 0.6 : 1 }}
      >
        {importing ? `⏳ Importing… ${progress}%` : `⬆ Import ${parsed.length.toLocaleString()} Instruments`}
      </button>
    </div>
  );
}

// ── Instrument Table ──────────────────────────────────────────────────────────
function InstrumentTable({ refresh }) {
  const { toast } = usePortfolio();
  const [instruments, setInstruments] = useState([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [assetFilter, setAssetFilter] = useState('');
  const [exFilter, setExFilter]       = useState('');
  const [page, setPage]               = useState(1);
  const [deleting, setDeleting]       = useState(null);
  const PAGE_SIZE = 20;
  const debounce = useRef(null);

  const load = useCallback(async (q, at, ex, p) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE });
      if (q) params.set('q', q);
      if (at) params.set('assetType', at);
      // exchange filter needs custom handling — extend q
      const url = `/api/instruments?${params}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setInstruments(data.instruments || []);
      // We don't have total count from API; estimate
      setTotal((p - 1) * PAGE_SIZE + (data.instruments?.length || 0) + (data.instruments?.length === PAGE_SIZE ? 1 : 0));
    } catch { setInstruments([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); load(query, assetFilter, exFilter, 1); }, 250);
  }, [query, assetFilter, exFilter, load, refresh]);

  useEffect(() => { load(query, assetFilter, exFilter, page); }, [page]);

  async function handleDelete(inst) {
    if (!confirm(`Delete "${inst.symbol}" (${inst.exchange})?\nThis will fail if any trades reference it.`)) return;
    setDeleting(inst.id);
    try {
      const res = await fetch('/api/instruments/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inst.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast(`${inst.symbol} deleted`, 'blue');
      load(query, assetFilter, exFilter, page);
    } catch (e) {
      toast(e.message, 'red');
    } finally {
      setDeleting(null);
    }
  }

  const exchColors = { NSE: 'var(--green2)', BSE: 'var(--orange)', AMFI: 'var(--teal)' };
  const typeColors = { STOCK: 'var(--purple)', MF: 'var(--accent2)' };

  return (
    <div className="glass" style={{ overflow: 'hidden' }}>
      {/* Controls */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search symbol or name…"
          style={{ flex: 1, minWidth: 160, maxWidth: 300 }}
        />
        <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} style={{ width: 130 }}>
          <option value="">All Types</option>
          {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
          {loading ? 'Loading…' : `Showing ${instruments.length} results`}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>Exchange</th>
              <th>Type</th>
              <th>Sector</th>
              <th>ISIN</th>
              <th>Price</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((inst, i) => (
              <tr key={inst.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)' }}>{inst.symbol}</td>
                <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inst.name}>{inst.name}</td>
                <td>
                  <Badge label={inst.exchange} color={exchColors[inst.exchange] || 'var(--text2)'} bg={`${exchColors[inst.exchange] || '#999'}15`} border={`${exchColors[inst.exchange] || '#999'}30`} />
                </td>
                <td>
                  <Badge label={inst.assetType} color={typeColors[inst.assetType] || 'var(--text2)'} bg={`${typeColors[inst.assetType] || '#999'}15`} border={`${typeColors[inst.assetType] || '#999'}30`} />
                </td>
                <td style={{ fontSize: 11, color: 'var(--text3)' }}>{inst.sector || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{inst.isin || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: inst.price ? 'var(--green2)' : 'var(--text3)' }}>
                  {inst.price ? `₹${parseFloat(inst.price).toFixed(2)}` : '—'}
                </td>
                <td>
                  <button
                    onClick={() => handleDelete(inst)}
                    disabled={deleting === inst.id}
                    title="Delete instrument"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red2)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, opacity: deleting === inst.id ? 0.4 : 0.7 }}
                  >
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

      {/* Pagination */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Page {page}</span>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setPage(p => p + 1)} disabled={instruments.length < PAGE_SIZE}>Next →</button>
      </div>
    </div>
  );
}

// ── Quick preset CSV download links ──────────────────────────────────────────
function DataSourcesHelp() {
  return (
    <div className="glass" style={{ padding: 16, background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)', marginBottom: 8 }}>📥 Download Official CSV Files</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { label: 'NSE Equity List', url: 'https://archives.nseindia.com/content/equities/EQUITY_L.csv', badge: 'NSE', color: 'var(--green2)' },
          { label: 'BSE Equity List', url: 'https://www.bseindia.com/corporates/List_Scrips.aspx', badge: 'BSE', color: 'var(--orange)' },
          { label: 'NSE ETF List', url: 'https://archives.nseindia.com/content/equities/eq_etfseclist.csv', badge: 'ETF', color: 'var(--accent2)' },
          { label: 'AMFI Fund List (NAVAll)', url: 'https://portal.amfiindia.com/spages/NAVAll.txt', badge: 'AMFI', color: 'var(--teal)' },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <Badge label={s.badge} color={s.color} bg={`${s.color}18`} border={`${s.color}30`} />
            <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{s.label}</span>
            <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent2)', textDecoration: 'none', fontWeight: 600 }}>Open ↗</a>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text3)', lineHeight: 1.7 }}>
        Download the CSV, then drag it into the Bulk Import box above. The importer auto-detects BSE / NSE / ETF format from the filename or column headers.
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export default function InstrumentsView() {
  const [tableRefresh, setTableRefresh] = useState(0);

  function refresh() { setTableRefresh(n => n + 1); }

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { icon: '🏛', label: 'NSE Equities', desc: 'Search & trade any NSE symbol', color: 'var(--green2)' },
          { icon: '📊', label: 'BSE Equities', desc: 'All BSE listed instruments', color: 'var(--orange)' },
          { icon: '💼', label: 'ETFs', desc: 'Index & thematic ETFs', color: 'var(--accent2)' },
          { icon: '📈', label: 'Mutual Funds', desc: 'All AMFI registered schemes', color: 'var(--teal)' },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: m.color, marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.desc}</div>
          </div>
        ))}
      </div>

      {/* Two-col: add + bulk import */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <AddInstrumentForm onAdded={refresh} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BulkImportPanel onImported={refresh} />
          <DataSourcesHelp />
        </div>
      </div>

      {/* Instrument browser */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>🔍 Instrument Browser</div>
        <InstrumentTable refresh={tableRefresh} />
      </div>
    </div>
  );
}
