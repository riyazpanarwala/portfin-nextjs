'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const PAGE_SIZE = 20;

// ── CSV parsers ───────────────────────────────────────────────────────────────

export function parseBSE(text) {
  const lines = text.split('\n');
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(',');
    if (cols.length < 8) continue;
    const symbol = cols[2]?.trim(), name = cols[1]?.trim(), isin = cols[7]?.trim();
    if (!symbol) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'BSE', assetType: 'STOCK' });
  }
  return results;
}

export function parseNSE(text) {
  const lines = text.split('\n');
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(',');
    if (cols.length < 7) continue;
    const symbol = cols[0]?.trim(), name = cols[1]?.trim(), isin = cols[6]?.trim();
    if (!symbol) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'NSE', assetType: 'STOCK' });
  }
  return results;
}

export function parseETF(text) {
  const lines = text.split('\n');
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(',');
    if (cols.length < 6) continue;
    const symbol = cols[0]?.trim(), name = cols[2]?.trim(), isin = cols[5]?.trim();
    if (!symbol) continue;
    results.push({ symbol, name: name || symbol, isin: isin || null, exchange: 'NSE', assetType: 'STOCK', sector: 'Index ETF' });
  }
  return results;
}

export function detectFileType(filename, text) {
  const fn = filename.toLowerCase();
  if (fn.includes('bse')) return 'bse';
  if (fn.includes('etf')) return 'etf';
  if (fn.includes('nse')) return 'nse';
  const h = text.slice(0, 200).toLowerCase();
  if (h.includes('security id') || h.includes('security code')) return 'bse';
  if (h.includes('underlying')) return 'etf';
  return 'nse';
}

// ── Hook: instrument browser table ───────────────────────────────────────────

export function useInstrumentTable({ refresh }) {
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');
  const [assetFilter, setAssetFilter] = useState('');
  const [page, setPage]               = useState(1);
  const [deleting, setDeleting]       = useState(null);
  const debounce = useRef(null);

  const load = useCallback(async (q, at, p) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE });
      if (q)  params.set('q', q);
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

  useEffect(() => { load(query, assetFilter, page); }, [page]); // eslint-disable-line

  async function handleDelete(inst, toast) {
    if (!confirm(`Delete "${inst.symbol}" (${inst.exchange})?\nFails if trades reference it.`)) return;
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
      load(query, assetFilter, page);
    } catch (e) { toast(e.message, 'red'); }
    finally { setDeleting(null); }
  }

  return {
    instruments, loading, query, setQuery,
    assetFilter, setAssetFilter, page, setPage,
    deleting, handleDelete,
    hasPrev: page > 1,
    hasNext: instruments.length === PAGE_SIZE,
    PAGE_SIZE,
  };
}

// ── Hook: add single instrument form ─────────────────────────────────────────

export function useAddInstrumentForm({ onAdded, toast }) {
  const [assetType, setAssetType]   = useState('STOCK');
  const [exchange, setExchange]     = useState('NSE');
  const [form, setForm]             = useState({ symbol: '', name: '', isin: '', sector: '' });
  const [saving, setSaving]         = useState(false);
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
        body: JSON.stringify({
          instruments: [{
            symbol:    form.symbol.toUpperCase().trim(),
            name:      form.name || form.symbol,
            isin:      form.isin || null,
            exchange,
            assetType,
            sector:    form.sector || null,
          }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast(data.created > 0 ? `✅ ${form.symbol} added to database` : `ℹ ${form.symbol} updated`, 'green');
      setForm({ symbol: '', name: '', isin: '', sector: '' });
      setAssetType('STOCK');
      setExchange('NSE');
      onAdded?.();
    } catch (e) { toast(e.message, 'red'); }
    finally { setSaving(false); }
  }

  return {
    assetType, exchange, setExchange, form, setF,
    saving, sectorOpen, setSectorOpen,
    handleAssetTypeChange, handleSelect, handleSubmit,
  };
}

// ── Hook: bulk import panel ───────────────────────────────────────────────────

export function useBulkImport({ onImported, toast }) {
  const [files, setFiles]         = useState([]);
  const [parsed, setParsed]       = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState(null);
  const [dragOver, setDragOver]   = useState(false);

  async function readFiles(fileList) {
    const fileArr = Array.from(fileList);
    setFiles(fileArr.map(f => ({ name: f.name, size: f.size, status: 'parsing' })));
    setResult(null);
    setProgress(0);
    const all = [];
    const updated = [];
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
    setImporting(true);
    setProgress(0);
    setResult(null);
    const CHUNK = 200;
    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, allErrors = [];
    for (let i = 0; i < parsed.length; i += CHUNK) {
      try {
        const res = await fetch('/api/instruments/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments: parsed.slice(i, i + CHUNK) }),
        });
        const d = await res.json();
        totalCreated += d.created || 0;
        totalUpdated += d.updated || 0;
        totalSkipped += d.skipped || 0;
        allErrors = [...allErrors, ...(d.errors || [])];
      } catch { totalSkipped += CHUNK; }
      setProgress(Math.min(100, Math.round(((i + CHUNK) / parsed.length) * 100)));
    }
    setResult({ created: totalCreated, updated: totalUpdated, skipped: totalSkipped, errors: allErrors });
    setImporting(false);
    toast(`Import done — ${totalCreated} new, ${totalUpdated} updated`, 'green');
    onImported?.();
  }

  return {
    files, parsed, importing, progress, result, dragOver,
    setDragOver, readFiles, handleImport,
  };
}

// ── Hook: symbol search dropdown ──────────────────────────────────────────────

export function useSymbolSearch({ exchange, assetType, onSelect }) {
  const [query, setQuery]         = useState('');
  const [suggestions, setSugs]    = useState([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounce = useRef(null);

  // Reset on type/exchange change
  useEffect(() => {
    setQuery(''); setSugs([]); setSelected(null); setOpen(false);
  }, [assetType, exchange]);

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

    if (!inst.sector && inst.assetType === 'STOCK' && ['NSE', 'BSE'].includes(inst.exchange)) {
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

  function clear(inputRef) {
    setQuery(''); setSelected(null); setSugs([]); setOpen(false);
    onSelect(null);
    setTimeout(() => inputRef?.current?.focus(), 50);
  }

  return {
    query, setQuery, suggestions, open, setOpen,
    loading, enriching, selected, activeIdx,
    pickSuggestion, handleKeyDown, clear,
  };
}
