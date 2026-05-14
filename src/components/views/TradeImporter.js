'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Download, Trash2, Play } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';

// ─── Broker format definitions ────────────────────────────────────────────────

const BROKER_FORMATS = {
  zerodha: {
    name: 'Zerodha / Kite',
    color: '#387ed1',
    detect: (headers) => headers.some(h => /^(trade date|tradingsymbol|instrument type)/i.test(h)),
    parse: parseZerodha,
  },
  groww: {
    name: 'Groww',
    color: '#00d09c',
    detect: (headers) => headers.some(h => /^(scheme name|folio|order date|nav)/i.test(h)),
    parse: parseGroww,
  },
  generic: {
    name: 'Generic CSV',
    color: '#8b5cf6',
    detect: () => true,
    parse: parseGeneric,
  },
};

// ─── Parser functions ──────────────────────────────────────────────────────────

function parseZerodha(rows) {
  return rows
    .filter(r => r['Symbol'] || r['Tradingsymbol'])
    .map(r => {
      const symbol = (r['Symbol'] || r['Tradingsymbol'] || '').trim().toUpperCase();
      const rawDate = r['Trade Date'] || r['Order Execution Time'] || '';
      const tradeDate = normalizeDate(rawDate);
      const tradeType = /sell/i.test(r['Trade Type'] || r['Transaction Type'] || '') ? 'SELL' : 'BUY';
      const qty = parseFloat(r['Quantity'] || r['Qty'] || 0);
      const price = parseFloat(r['Price'] || r['Average Price'] || 0);
      const brokerage = parseFloat(r['Brokerage'] || 0) || null;
      const isin = (r['ISIN'] || '').trim() || null;
      const instrumentType = r['Instrument Type'] || r['Series'] || 'EQ';
      const assetType = /^(MF|mutual)/i.test(instrumentType) ? 'MF' : 'STOCK';
      const exchange = r['Exchange'] || (assetType === 'MF' ? 'AMFI' : 'NSE');
      return { symbol, tradeDate, tradeType, quantity: qty, price, brokerage, assetType, exchange, isin, name: r['Security Name'] || symbol };
    })
    .filter(r => r.symbol && r.quantity > 0 && r.price > 0 && r.tradeDate);
}

function parseGroww(rows) {
  return rows
    .filter(r => r['Scheme Name'] || r['Stock Name'])
    .map(r => {
      const isMF = !!r['Scheme Name'];
      const symbol = normalizeSymbol(r['Scheme Name'] || r['Stock Name'] || r['Symbol'] || '');
      const rawDate = r['Order Date'] || r['Transaction Date'] || r['Date'] || '';
      const tradeDate = normalizeDate(rawDate);
      const tradeType = /sell|redemption/i.test(r['Transaction Type'] || r['Order Type'] || '') ? 'SELL' : 'BUY';
      const qty = parseFloat(r['Units'] || r['Quantity'] || 0);
      const price = parseFloat(r['NAV'] || r['Price'] || r['Average Price'] || 0);
      const isin = (r['ISIN'] || '').trim() || null;
      return {
        symbol, tradeDate, tradeType, quantity: qty, price,
        assetType: isMF ? 'MF' : 'STOCK',
        exchange: isMF ? 'AMFI' : 'NSE',
        isin, name: r['Scheme Name'] || r['Stock Name'] || symbol,
      };
    })
    .filter(r => r.symbol && r.quantity > 0 && r.price > 0 && r.tradeDate);
}

function parseGeneric(rows) {
  return rows
    .filter(r => {
      const vals = Object.values(r);
      return vals.some(v => v) && (
        Object.keys(r).some(k => /symbol|ticker|stock|fund|scheme/i.test(k))
      );
    })
    .map(r => {
      const keys = Object.keys(r);
      const get = (...patterns) => {
        const key = keys.find(k => patterns.some(p => new RegExp(p, 'i').test(k)));
        return key ? String(r[key] || '').trim() : '';
      };
      const symbol = normalizeSymbol(get('symbol', 'ticker', 'stock', 'fund', 'scheme', 'scrip'));
      const rawDate = get('date', 'trade.?date', 'order.?date', 'execution');
      const tradeDate = normalizeDate(rawDate);
      // Use a narrow pattern that matches trade direction columns only —
      // avoids accidentally matching AssetType / InstrumentType columns.
      const typeStr = get('^type$', '^trade.?type$', '^transaction.?type$', '^order.?type$', '^side$', '^buy.?sell$');
      const tradeType = /sell|redemption/i.test(typeStr) ? 'SELL' : 'BUY';
      const qty = parseFloat(get('qty', 'quantity', 'units', 'shares') || 0);
      const price = parseFloat(get('price', 'nav', 'rate', 'avg') || 0);
      const brokerage = parseFloat(get('brokerage', 'commission', 'charges') || 0) || null;
      const isin = get('isin').toUpperCase() || null;
      const assetTypeHint = get('^asset.?type$', '^instrument.?type$', '^series$', '^segment$');
      const assetType = /^MF|mutual|fund/i.test(assetTypeHint) ? 'MF' : 'STOCK';
      const exchange = get('exchange') || (assetType === 'MF' ? 'AMFI' : 'NSE');
      return { symbol, tradeDate, tradeType, quantity: qty, price, brokerage, assetType, exchange, isin, name: symbol };
    })
    .filter(r => r.symbol && r.quantity > 0 && r.price > 0 && r.tradeDate);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSymbol(raw) {
  return raw.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^\w\-&]/g, '').slice(0, 40);
}

function normalizeDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m2) {
    const yr = m2[3].length === 2 ? '20' + m2[3] : m2[3];
    return `${yr}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  }
  const m3 = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m3) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mo = months[m3[2].toLowerCase().slice(0, 3)];
    if (mo) return `${m3[3]}-${String(mo).padStart(2, '0')}-${m3[1].padStart(2, '0')}`;
  }
  return '';
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^["'\s]+|["'\s]+$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ? vals[i].replace(/^["'\s]+|["'\s]+$/g, '').trim() : ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function splitCSVLine(line) {
  const result = [];
  let inQuotes = false, current = '';
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Dynamically import xlsx so it doesn't bloat the initial bundle
        const XLSX = await import('xlsx').then(m => m.default ?? m);
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }));
      } catch (err) {
        reject(new Error('Could not parse Excel file. Try saving as CSV first.'));
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsArrayBuffer(file);
  });
}

function detectBroker(rows) {
  if (!rows.length) return 'generic';
  const headers = Object.keys(rows[0]);
  for (const [id, fmt] of Object.entries(BROKER_FORMATS)) {
    if (id === 'generic') continue;
    if (fmt.detect(headers)) return id;
  }
  return 'generic';
}

function validateTrade(t) {
  const errors = [];
  if (!t.symbol) errors.push('Missing symbol');
  if (!t.tradeDate) errors.push('Invalid or missing date');
  if (!t.quantity || t.quantity <= 0) errors.push('Invalid quantity');
  if (!t.price || t.price <= 0) errors.push('Invalid price');
  if (!['BUY', 'SELL'].includes(t.tradeType)) errors.push('Unknown trade type');
  return errors;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TradeImporter({ onClose }) {
  const { addTrade, portfolioId, toast } = usePortfolio();
  const [phase, setPhase] = useState('upload');
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [detectedBroker, setDetectedBroker] = useState(null);
  const [parsedTrades, setParsedTrades] = useState([]);
  const [editedTrades, setEditedTrades] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const [parseError, setParseError] = useState('');
  const fileRef = useRef(null);

  // ── File processing ──────────────────────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    setParseError('');
    try {
      let rows;
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        const text = await file.text();
        rows = parseCSV(text);
      } else if (file.name.match(/\.xlsx?$/)) {
        rows = await parseExcel(file);
      } else {
        throw new Error('Unsupported file type. Please use .csv or .xlsx');
      }

      if (!rows.length) throw new Error('File appears empty or has no readable rows');

      const brokerId = detectBroker(rows);
      const broker = BROKER_FORMATS[brokerId];
      const trades = broker.parse(rows).map((t, i) => ({
        ...t,
        _id: i,
        _errors: validateTrade(t),
        _selected: validateTrade(t).length === 0,
      }));

      if (!trades.length) throw new Error('No valid trades found. Check the file format or try the template CSV.');

      setFileName(file.name);
      setDetectedBroker(brokerId);
      setParsedTrades(trades);
      setEditedTrades(trades);
      setSelectedIds(new Set(trades.filter(t => t._errors.length === 0).map(t => t._id)));
      setPhase('review');
    } catch (err) {
      setParseError(err.message);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileInput = useCallback((e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  }, [processFile]);

  // ── Import ───────────────────────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    const toImport = editedTrades.filter(t => selectedIds.has(t._id) && t._errors.length === 0);
    if (!toImport.length) return;

    setPhase('importing');
    setProgress({ done: 0, total: toImport.length, errors: [] });
    const errors = [];

    for (let i = 0; i < toImport.length; i++) {
      const t = toImport[i];
      try {
        await addTrade({
          portfolioId,
          symbol: t.symbol,
          name: t.name || t.symbol,
          assetType: t.assetType,
          exchange: t.exchange,
          tradeType: t.tradeType,
          quantity: t.quantity,
          price: t.price,
          brokerage: t.brokerage || null,
          tradeDate: t.tradeDate,
          isin: t.isin || undefined,
        });
        setProgress(p => ({ ...p, done: i + 1 }));
      } catch (err) {
        errors.push(`${t.symbol} (${t.tradeDate}): ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 40));
    }

    setProgress(p => ({ ...p, errors }));
    setPhase('done');
  }, [editedTrades, selectedIds, addTrade, portfolioId]);

  // ── Field edit ───────────────────────────────────────────────────────────────
  // FIX (Issue 4): editField is unchanged — it still updates the parent array.
  // The key fix is in the EditCell component below: instead of keeping local
  // useState for the edit value, EditCell is now a pure controlled input.
  // The parent holds a single `activeEdit` cursor { id, field, value } so only
  // ONE cell is ever in edit mode at a time, and it survives parent re-renders
  // because the state lives here, not inside a child that remounts.
  const [activeEdit, setActiveEdit] = useState(null); // { id, field, value }

  const commitEdit = useCallback((id, field, value) => {
    setEditedTrades(prev => prev.map(t => {
      if (t._id !== id) return t;
      const updated = {
        ...t,
        [field]: field === 'quantity' || field === 'price' ? parseFloat(value) || 0 : value,
      };
      return { ...updated, _errors: validateTrade(updated) };
    }));
    setActiveEdit(null);
  }, []);

  const editField = useCallback((id, field, value) => {
    setEditedTrades(prev => prev.map(t => {
      if (t._id !== id) return t;
      const updated = { ...t, [field]: field === 'quantity' || field === 'price' ? parseFloat(value) || 0 : value };
      return { ...updated, _errors: validateTrade(updated) };
    }));
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const valid = editedTrades.filter(t => t._errors.length === 0).map(t => t._id);
    if (selectedIds.size === valid.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(valid));
  }, [editedTrades, selectedIds]);

  const removeRow = useCallback((id) => {
    setEditedTrades(prev => prev.filter(t => t._id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (activeEdit?.id === id) setActiveEdit(null);
  }, [activeEdit]);

  function downloadTemplate() {
    const csv = [
      'Symbol,Trade Date,Trade Type,Asset Type,Exchange,Quantity,Price,Brokerage,ISIN,Name',
      'INFY,2024-01-15,BUY,STOCK,NSE,10,1500.00,20,INE009A01021,Infosys Ltd',
      'HDFC-MIDCAP-FUND,2024-02-01,BUY,MF,AMFI,50.123,85.45,,INF179K01VQ9,HDFC Mid-Cap Fund',
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = 'portfin_trade_template.csv';
    a.click();
  }

  const selectedCount = selectedIds.size;
  const validCount = editedTrades.filter(t => t._errors.length === 0).length;
  const errorCount = editedTrades.filter(t => t._errors.length > 0).length;

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(6,10,20,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        width: '100%', maxWidth: phase === 'review' ? '900px' : '560px',
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: '16px', overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.04))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileSpreadsheet size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>Import Trades</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                {phase === 'upload' && 'Zerodha · Groww · Kite · Generic CSV'}
                {phase === 'review' && `${fileName} · ${BROKER_FORMATS[detectedBroker]?.name}`}
                {phase === 'importing' && 'Importing trades…'}
                {phase === 'done' && 'Import complete'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
            color: 'var(--text2)', cursor: 'pointer', padding: '6px 8px',
            display: 'flex', alignItems: 'center',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: phase === 'review' ? '0' : '24px' }}>

          {/* ── UPLOAD ── */}
          {phase === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '12px', padding: '44px 24px',
                  textAlign: 'center', cursor: 'pointer',
                  background: dragging ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.01)',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: '56px', height: '56px', borderRadius: '14px',
                  background: dragging ? 'rgba(59,130,246,0.2)' : 'var(--bg3)',
                  border: `1px solid ${dragging ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', transition: 'all 0.2s',
                }}>
                  <Upload size={24} color={dragging ? 'var(--accent2)' : 'var(--text3)'} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', marginBottom: '6px' }}>
                  {dragging ? 'Release to import' : 'Drop your file here'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '14px' }}>
                  or click to browse — supports CSV and XLSX
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {Object.entries(BROKER_FORMATS).map(([id, fmt]) => (
                    <span key={id} style={{
                      fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px',
                      background: `${fmt.color}18`, color: fmt.color, border: `1px solid ${fmt.color}40`,
                    }}>{fmt.name}</span>
                  ))}
                </div>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={onFileInput} />
              </div>

              {parseError && (
                <div style={{
                  padding: '12px 16px', borderRadius: '10px',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  display: 'flex', gap: '10px', alignItems: 'flex-start',
                }}>
                  <AlertTriangle size={16} color="var(--red2)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--red2)', marginBottom: '3px' }}>Parse Error</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{parseError}</div>
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)' }}>Expected Columns</span>
                  <button onClick={downloadTemplate} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }}>
                    <Download size={12} /> Template CSV
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    ['Symbol / Tradingsymbol', 'Required'],
                    ['Trade Date / Order Date', 'Required · DD/MM/YYYY'],
                    ['Trade Type / Transaction', 'BUY or SELL'],
                    ['Quantity / Units', 'Required'],
                    ['Price / NAV / Avg Price', 'Required'],
                    ['Asset Type', 'STOCK or MF (auto-detected)'],
                    ['Exchange', 'NSE · BSE · AMFI'],
                    ['Brokerage / Commission', 'Optional'],
                    ['ISIN', 'Optional but recommended'],
                  ].map(([col, hint], i) => (
                    <div key={i} style={{ fontSize: '11px', padding: '4px 0' }}>
                      <span style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{col}</span>
                      <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>{hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── REVIEW ── */}
          {phase === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Stats bar */}
              <div style={{
                padding: '12px 20px',
                background: 'var(--bg3)', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
                  <Stat label="Total"     value={editedTrades.length} color="var(--text)" />
                  <Stat label="Valid"     value={validCount}          color="var(--green2)" />
                  {errorCount > 0 && <Stat label="Needs fix" value={errorCount} color="var(--yellow)" />}
                  <Stat label="Selected" value={selectedCount}        color="var(--accent2)" />
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px',
                  background: `${BROKER_FORMATS[detectedBroker]?.color}20`,
                  color: BROKER_FORMATS[detectedBroker]?.color,
                  border: `1px solid ${BROKER_FORMATS[detectedBroker]?.color}40`,
                }}>
                  {BROKER_FORMATS[detectedBroker]?.name} detected
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <th style={{ ...TH_STYLE, width: '36px' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.size === validCount && validCount > 0}
                          onChange={toggleAll}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                      </th>
                      <th style={TH_STYLE}>SYMBOL</th>
                      <th style={TH_STYLE}>DATE</th>
                      <th style={TH_STYLE}>TYPE</th>
                      <th style={{ ...TH_STYLE, textAlign: 'right' }}>QTY</th>
                      <th style={{ ...TH_STYLE, textAlign: 'right' }}>PRICE</th>
                      <th style={TH_STYLE}>ASSET</th>
                      <th style={TH_STYLE}>EXCH</th>
                      <th style={{ ...TH_STYLE, width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editedTrades.map((t) => {
                      const hasError  = t._errors.length > 0;
                      const isExpanded = expandedRows.has(t._id);

                      return (
                        <>
                          <tr
                            key={t._id}
                            style={{
                              background: hasError
                                ? 'rgba(245,158,11,0.04)'
                                : selectedIds.has(t._id)
                                  ? 'rgba(59,130,246,0.03)'
                                  : 'transparent',
                            }}
                          >
                            <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(t._id) && !hasError}
                                disabled={hasError}
                                onChange={() => toggleSelect(t._id)}
                                style={{ accentColor: 'var(--accent)' }}
                              />
                            </td>

                            {/* FIX (Issue 4): EditCell is now a controlled component driven by
                                `activeEdit` state that lives in the parent.  When a cell is
                                activated the parent stores { id, field, value }; all other cells
                                read from editedTrades directly.  This means a setEditedTrades
                                call for row B no longer causes row A's in-progress input to
                                remount and lose its value — the active-edit cursor is preserved
                                across parent re-renders. */}
                            <td style={TD_STYLE}>
                              <EditCell
                                cellKey={`${t._id}:symbol`}
                                value={t.symbol}
                                activeEdit={activeEdit}
                                onActivate={(v) => setActiveEdit({ id: t._id, field: 'symbol', value: v })}
                                onChangeActive={(v) => setActiveEdit(a => ({ ...a, value: v }))}
                                onCommit={(v) => commitEdit(t._id, 'symbol', v)}
                                onCancel={() => setActiveEdit(null)}
                                mono
                                highlight={!t.symbol}
                              />
                            </td>
                            <td style={TD_STYLE}>
                              <EditCell
                                cellKey={`${t._id}:tradeDate`}
                                value={t.tradeDate}
                                activeEdit={activeEdit}
                                onActivate={(v) => setActiveEdit({ id: t._id, field: 'tradeDate', value: v })}
                                onChangeActive={(v) => setActiveEdit(a => ({ ...a, value: v }))}
                                onCommit={(v) => commitEdit(t._id, 'tradeDate', v)}
                                onCancel={() => setActiveEdit(null)}
                                placeholder="YYYY-MM-DD"
                                highlight={!t.tradeDate}
                              />
                            </td>
                            <td style={TD_STYLE}>
                              <select
                                value={t.tradeType}
                                onChange={e => editField(t._id, 'tradeType', e.target.value)}
                                style={{
                                  background: 'transparent', border: 'none',
                                  color: t.tradeType === 'BUY' ? 'var(--green2)' : 'var(--red2)',
                                  fontWeight: '700', fontSize: '11px', cursor: 'pointer', padding: '2px 0',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                <option value="BUY"  style={{ background: 'var(--bg2)', color: 'var(--green2)' }}>BUY</option>
                                <option value="SELL" style={{ background: 'var(--bg2)', color: 'var(--red2)' }}>SELL</option>
                              </select>
                            </td>
                            <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                              <EditCell
                                cellKey={`${t._id}:quantity`}
                                value={t.quantity}
                                activeEdit={activeEdit}
                                onActivate={(v) => setActiveEdit({ id: t._id, field: 'quantity', value: String(v) })}
                                onChangeActive={(v) => setActiveEdit(a => ({ ...a, value: v }))}
                                onCommit={(v) => commitEdit(t._id, 'quantity', v)}
                                onCancel={() => setActiveEdit(null)}
                                type="number"
                                highlight={!t.quantity || t.quantity <= 0}
                                right
                              />
                            </td>
                            <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                              <EditCell
                                cellKey={`${t._id}:price`}
                                value={t.price}
                                activeEdit={activeEdit}
                                onActivate={(v) => setActiveEdit({ id: t._id, field: 'price', value: String(v) })}
                                onChangeActive={(v) => setActiveEdit(a => ({ ...a, value: v }))}
                                onCommit={(v) => commitEdit(t._id, 'price', v)}
                                onCancel={() => setActiveEdit(null)}
                                type="number"
                                highlight={!t.price || t.price <= 0}
                                right
                              />
                            </td>
                            <td style={TD_STYLE}>
                              <select
                                value={t.assetType}
                                onChange={e => editField(t._id, 'assetType', e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: t.assetType === 'MF' ? 'var(--teal)' : 'var(--purple)', fontWeight: '600', fontSize: '11px', cursor: 'pointer', padding: '2px 0' }}
                              >
                                <option value="STOCK" style={{ background: 'var(--bg2)', color: 'var(--purple)' }}>STOCK</option>
                                <option value="MF"    style={{ background: 'var(--bg2)', color: 'var(--teal)' }}>MF</option>
                              </select>
                            </td>
                            <td style={TD_STYLE}>
                              <select
                                value={t.exchange}
                                onChange={e => editField(t._id, 'exchange', e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text2)', fontSize: '11px', cursor: 'pointer', padding: '2px 0' }}
                              >
                                <option value="NSE"  style={{ background: 'var(--bg2)' }}>NSE</option>
                                <option value="BSE"  style={{ background: 'var(--bg2)' }}>BSE</option>
                                <option value="AMFI" style={{ background: 'var(--bg2)' }}>AMFI</option>
                              </select>
                            </td>
                            <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                {hasError && (
                                  <button
                                    title={t._errors.join(', ')}
                                    onClick={() => setExpandedRows(p => {
                                      const n = new Set(p);
                                      if (n.has(t._id)) n.delete(t._id); else n.add(t._id);
                                      return n;
                                    })}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--yellow)', display: 'flex', alignItems: 'center' }}
                                  >
                                    <AlertTriangle size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={() => removeRow(t._id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text3)', opacity: 0.5, display: 'flex', alignItems: 'center' }}
                                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                  onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && hasError && (
                            <tr key={`${t._id}-err`} style={{ background: 'rgba(245,158,11,0.06)' }}>
                              <td colSpan={9} style={{ padding: '6px 14px 8px 46px' }}>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {t._errors.map((err, i) => (
                                    <span key={i} style={{
                                      fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                                      background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)',
                                      border: '1px solid rgba(245,158,11,0.25)',
                                    }}>{err}</span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── IMPORTING ── */}
          {phase === 'importing' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: '60px', height: '60px', borderRadius: '50%',
                background: 'rgba(59,130,246,0.1)', border: '2px solid rgba(59,130,246,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', animation: 'spin 1s linear infinite',
              }}>
                <FileSpreadsheet size={24} color="var(--accent2)" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '6px' }}>
                Importing {progress.done} / {progress.total}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '20px' }}>
                Adding trades to your portfolio…
              </div>
              <div style={{ height: '8px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden', maxWidth: '300px', margin: '0 auto' }}>
                <div style={{
                  height: '100%', borderRadius: '4px',
                  background: 'linear-gradient(90deg, var(--accent), var(--purple))',
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: '60px', height: '60px', borderRadius: '50%',
                background: 'rgba(16,185,129,0.1)', border: '2px solid rgba(16,185,129,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <CheckCircle2 size={28} color="var(--green2)" />
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
                {progress.done} trade{progress.done !== 1 ? 's' : ''} imported!
              </div>
              {progress.errors.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(245,158,11,0.06)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', maxWidth: '380px', margin: '12px auto 0', textAlign: 'left' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--yellow)', marginBottom: '6px' }}>
                    {progress.errors.length} failed:
                  </div>
                  {progress.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '3px' }}>{e}</div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '20px' }}>
                <button className="btn btn-primary" onClick={onClose} style={{ padding: '10px 28px' }}>
                  View Portfolio
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(phase === 'upload' || phase === 'review') && (
          <div style={{
            padding: '14px 20px', borderTop: '1px solid var(--border)',
            background: 'var(--bg3)', flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            {phase === 'upload' && (
              <>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  All data stays local — nothing is sent to third parties.
                </div>
                <button className="btn btn-ghost" onClick={onClose} style={{ padding: '7px 16px' }}>Cancel</button>
              </>
            )}
            {phase === 'review' && (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => { setPhase('upload'); setParsedTrades([]); setEditedTrades([]); setParseError(''); setActiveEdit(null); }}
                  style={{ padding: '7px 16px' }}
                >
                  ← Back
                </button>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    {selectedCount} trade{selectedCount !== 1 ? 's' : ''} will be imported
                  </span>
                  <button
                    className="btn btn-primary"
                    onClick={runImport}
                    disabled={selectedCount === 0}
                    style={{ padding: '8px 20px', opacity: selectedCount === 0 ? 0.5 : 1 }}
                  >
                    <Play size={14} /> Import {selectedCount > 0 ? selectedCount : ''} Trade{selectedCount !== 1 ? 's' : ''}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
      <span style={{ fontSize: '17px', fontWeight: '700', fontFamily: 'var(--font-mono)', color }}>{value}</span>
      <span style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
    </div>
  );
}

/**
 * EditCell — FIX (Issue 4)
 *
 * Previously each cell kept its own `useState({ editing, localVal })`.
 * Because EditCell is rendered inside `editedTrades.map(...)`, ANY call to
 * `setEditedTrades` (including for a completely different row) could cause
 * React to remount the component if the array identity changed, blowing away
 * the `editing` and `localVal` state mid-keystroke.
 *
 * The fix: EditCell is now a pure controlled display/input.  All edit state
 * lives in the parent's `activeEdit` cursor.  A cell is "active" when
 * `activeEdit` matches its `cellKey`.  Switching from display→input mode is
 * driven by the parent, so no local state can be lost.
 */
function EditCell({
  cellKey, value, activeEdit,
  onActivate, onChangeActive, onCommit, onCancel,
  type = 'text', placeholder, mono, highlight, right,
}) {
  const isActive = activeEdit?.id != null &&
    cellKey === `${activeEdit.id}:${activeEdit.field}`;

  if (isActive) {
    return (
      <input
        autoFocus
        type={type}
        value={activeEdit.value}
        onChange={e => onChangeActive(e.target.value)}
        onBlur={() => onCommit(activeEdit.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onCommit(activeEdit.value); }
          if (e.key === 'Escape') onCancel();
        }}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--accent)',
          borderRadius: '4px', color: 'var(--text)',
          fontSize: '11px', padding: '2px 5px',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-main)',
          textAlign: right ? 'right' : 'left',
          width: '100%', minWidth: '60px',
        }}
      />
    );
  }

  return (
    <span
      onClick={() => onActivate(String(value ?? ''))}
      title="Click to edit"
      style={{
        display: 'block',
        fontSize: '12px',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        color: highlight ? 'var(--yellow)' : 'var(--text)',
        textAlign: right ? 'right' : 'left',
        cursor: 'text',
        borderRadius: '3px', padding: '1px 3px',
        border: '1px solid transparent',
        transition: 'border-color 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
    >
      {value || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>{placeholder || '—'}</span>}
    </span>
  );
}

const TH_STYLE = {
  padding: '8px 10px',
  fontSize: '9px', fontWeight: '700', letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text3)',
  background: 'var(--bg3)', borderBottom: '1px solid var(--border)',
  textAlign: 'left', whiteSpace: 'nowrap',
};

const TD_STYLE = {
  padding: '6px 10px',
  borderBottom: '1px solid rgba(45,64,96,0.3)',
  verticalAlign: 'middle',
};
