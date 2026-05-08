'use client';

import { useState, useRef } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import {
  useInstrumentTable,
  useAddInstrumentForm,
  useBulkImport,
  useSymbolSearch,
} from '@/hooks/useInstrumentsView';
import styles from './InstrumentsView.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const EXCHANGES  = ['NSE', 'BSE', 'AMFI'];
const ASSET_TYPES = ['STOCK', 'MF'];

const exchColors = { NSE: 'var(--green2)', BSE: 'var(--orange)', AMFI: 'var(--teal)' };
const typeColors = { STOCK: 'var(--purple)', MF: 'var(--accent2)' };

const typeColor  = { bse: 'var(--orange)', nse: 'var(--green2)', etf: 'var(--accent2)' };
const typeLabel  = { bse: 'BSE Equity', nse: 'NSE Equity', etf: 'NSE ETF' };

const SECTOR_SUGGESTIONS = [
  'Large Cap','Mid Cap','Small Cap','Flexi Cap','ELSS','Value',
  'Diversified','Banking','IT','Energy','Power','Defence',
  'FMCG','Finance','Metals & Mining','Construction',
  'Renewable Energy','Index ETF','Commodities ETF','Pharma',
];

// ── Shared badge atom ─────────────────────────────────────────────────────────

function Badge({ label, color = 'var(--accent2)', bg = 'rgba(59,130,246,0.12)', border = 'rgba(59,130,246,0.25)' }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: bg, color, border: `1px solid ${border}`,
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
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

function ProgressBar({ value, max, color = 'var(--accent)' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
    </div>
  );
}

// ── Symbol Search Dropdown ────────────────────────────────────────────────────

function SymbolSearchDropdown({ exchange, assetType, onSelect, disabled }) {
  const inputRef = useRef(null);
  const {
    query, setQuery, suggestions, open, setOpen,
    loading, enriching, selected, activeIdx,
    pickSuggestion, handleKeyDown, clear,
  } = useSymbolSearch({ exchange, assetType, onSelect });

  const ec = exchColors[exchange] || 'var(--text2)';

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

  return (
    <div className={styles.symbolSearchWrapper}>
      <div className={styles.symbolSearchBox} style={{
        border: `1px solid ${selected ? ec : open ? 'var(--accent)' : 'var(--border)'}`,
      }}>
        <span className={styles.symbolSearchExchangePill} style={{ color: ec, background: `${ec}12` }}>
          {exchange}
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value.toUpperCase()); onSelect(null); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onKeyDown={handleKeyDown}
          placeholder={assetType === 'MF' ? 'Type fund name or scheme code…' : 'Type symbol or company name…'}
          disabled={disabled}
          autoComplete="off"
          className={styles.symbolSearchInput}
        />
        <div className={styles.symbolSearchActions}>
          {loading   && <Spinner />}
          {enriching && <span className={styles.symbolSearchEnriching}>✦ fetching sector…</span>}
          {selected && !enriching && (
            <button onClick={() => clear(inputRef)} className={styles.symbolSearchClear} title="Clear selection">✕</button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className={styles.symbolDropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownHeaderText}>{suggestions.length} results for "{query}"</span>
            <div className={styles.dropdownHeaderBadges}>
              {suggestions.some(s => s.inDb)  && <Badge label="● In DB"    color="var(--green2)" bg="rgba(16,185,129,0.1)"  border="rgba(16,185,129,0.25)" />}
              {suggestions.some(s => !s.inDb) && <Badge label="○ From CSV" color="var(--text3)"  bg="var(--bg3)"            border="var(--border)" />}
            </div>
          </div>
          {suggestions.map((inst, i) => {
            const iec = exchColors[inst.exchange] || 'var(--text2)';
            return (
              <div
                key={`${inst.symbol}:${inst.exchange}:${i}`}
                onMouseDown={() => pickSuggestion(inst)}
                className={`${styles.dropdownItem} ${i === activeIdx ? styles.dropdownItemActive : ''}`}
              >
                <div className={styles.dropdownColorBar} style={{ background: iec }} />
                <div className={styles.dropdownItemContent}>
                  <div className={styles.dropdownItemLine1}>
                    <span className={styles.dropdownItemSymbol} style={{ color: iec }}>
                      {highlight(inst.symbol, query)}
                    </span>
                    <Badge label={inst.exchange} color={iec} bg={`${iec}15`} border={`${iec}30`} />
                    <Badge label={inst.assetType} color={typeColors[inst.assetType] || 'var(--text2)'} bg={`${typeColors[inst.assetType] || '#999'}15`} border={`${typeColors[inst.assetType] || '#999'}30`} />
                    {inst.inDb   && <Badge label="✓ In DB" color="var(--green2)" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.25)" />}
                    {inst.sector && <Badge label={inst.sector} color="var(--text2)" bg="var(--bg3)" border="var(--border)" />}
                  </div>
                  <div className={styles.dropdownItemName}>{highlight(inst.name, query.length > 3 ? query : '')}</div>
                  {(inst.isin || inst.price) && (
                    <div className={styles.dropdownItemLine3}>
                      {inst.isin  && <span className={styles.dropdownItemIsin}>{inst.isin}</span>}
                      {inst.price && <span className={styles.dropdownItemPrice}>₹{parseFloat(inst.price).toFixed(2)}</span>}
                    </div>
                  )}
                </div>
                <span className={styles.dropdownItemArrow}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* No results */}
      {open && !loading && suggestions.length === 0 && query.length >= 2 && (
        <div className={styles.dropdownNoResults}>
          <div className={styles.dropdownNoResultsIcon}>🔍</div>
          <div className={styles.dropdownNoResultsTitle}>No results for "{query}"</div>
          <div className={styles.dropdownNoResultsSub}>Try a different symbol or fill in the fields below manually.</div>
        </div>
      )}

      {/* Selected card */}
      {selected && !open && (
        <div
          className={styles.selectedCard}
          style={{
            background: `${exchColors[selected.exchange] || 'var(--accent)'}0d`,
            border: `1px solid ${exchColors[selected.exchange] || 'var(--accent)'}35`,
          }}
        >
          <div className={styles.selectedCardBar} style={{ background: exchColors[selected.exchange] || 'var(--accent)' }} />
          <div className={styles.selectedCardContent}>
            <div className={styles.selectedCardLine1}>
              <span className={styles.selectedCardSymbol} style={{ color: exchColors[selected.exchange] }}>{selected.symbol}</span>
              <Badge label={selected.exchange} color={exchColors[selected.exchange]} bg={`${exchColors[selected.exchange]}15`} border={`${exchColors[selected.exchange]}30`} />
              <Badge label={selected.assetType} color={typeColors[selected.assetType]} bg={`${typeColors[selected.assetType]}15`} border={`${typeColors[selected.assetType]}30`} />
              {selected.inDb && <Badge label="✓ Already in DB" color="var(--green2)" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.25)" />}
            </div>
            <div className={styles.selectedCardName}>{selected.name}</div>
            <div className={styles.selectedCardMeta}>
              {selected.isin     && <span className={styles.selectedCardIsin}>ISIN: {selected.isin}</span>}
              {selected.sector   && <span className={styles.selectedCardSector}>Sector: {selected.sector}</span>}
              {selected.industry && <span className={styles.selectedCardIndustry}>Industry: {selected.industry}</span>}
              {selected.price    && <span className={styles.selectedCardPrice}>₹{parseFloat(selected.price).toFixed(2)}</span>}
            </div>
          </div>
          <div className={styles.selectedCardCheck}>✓</div>
        </div>
      )}
    </div>
  );
}

// ── Add Instrument Form ───────────────────────────────────────────────────────

function AddInstrumentForm({ onAdded }) {
  const { toast } = usePortfolio();
  const {
    assetType, exchange, setExchange, form, setF,
    saving, sectorOpen, setSectorOpen,
    handleAssetTypeChange, handleSelect, handleSubmit,
  } = useAddInstrumentForm({ onAdded, toast });

  const Label = ({ ch, hint }) => (
    <div className={styles.fieldLabel}>
      <span className={styles.fieldLabelText}>{ch}</span>
      {hint && <span className={styles.fieldLabelHint}>{hint}</span>}
    </div>
  );

  return (
    <div className={`glass ${styles.addFormPanel}`}>
      <div className={styles.addFormTitle}>➕ Add Single Instrument</div>
      <div className={styles.addFormSub}>
        Search by symbol, company name, or ISIN — details auto-fill from NSE / BSE / ETF data.
        Sector &amp; industry enriched live from Yahoo Finance on exact match.
      </div>

      {/* Asset type */}
      <div>
        <Label ch="Asset Type" />
        <div className={styles.typeSelector}>
          {[['STOCK', '📈', 'Stock / ETF'], ['MF', '📊', 'Mutual Fund']].map(([val, icon, label]) => (
            <button key={val} onClick={() => handleAssetTypeChange(val)} className={styles.typeSelectorBtn} style={{
              border: `1px solid ${assetType === val ? 'var(--accent)' : 'var(--border)'}`,
              background: assetType === val ? 'rgba(59,130,246,0.15)' : 'var(--bg3)',
              color: assetType === val ? 'var(--accent2)' : 'var(--text3)',
            }}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      {/* Exchange (stocks only) */}
      {assetType === 'STOCK' && (
        <div>
          <Label ch="Exchange" />
          <div className={styles.exchangeSelector}>
            {['NSE', 'BSE'].map(ex => {
              const ec = exchColors[ex];
              return (
                <button key={ex} onClick={() => setExchange(ex)} className={styles.exchangeSelectorBtn} style={{
                  border: `1px solid ${exchange === ex ? ec : 'var(--border)'}`,
                  background: exchange === ex ? `${ec}18` : 'var(--bg3)',
                  color: exchange === ex ? ec : 'var(--text3)',
                }}>{ex}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Symbol search */}
      <div style={{ marginBottom: 16 }}>
        <Label ch="Search Symbol / Name / ISIN" hint="— auto-fills all fields on selection" />
        <SymbolSearchDropdown exchange={exchange} assetType={assetType} onSelect={handleSelect} disabled={saving} />
      </div>

      {/* Detail fields */}
      <div
        className={styles.detailFieldsBox}
        style={{
          background: form.symbol ? 'rgba(59,130,246,0.04)' : 'var(--bg3)',
          border: `1px solid ${form.symbol ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
        }}
      >
        <div className={styles.detailFieldsBoxTitle}>
          {form.symbol ? '✏️ Review & Edit — fields auto-filled from search' : '✏️ Or enter details manually'}
        </div>
        <div className={styles.detailRow}>
          <Label ch="Full Name / Scheme Name" />
          <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. Infosys Limited" />
        </div>
        <div className={styles.detailTwoCol}>
          <div>
            <Label ch="ISIN" hint="— optional" />
            <input value={form.isin} onChange={e => setF('isin', e.target.value.toUpperCase())} placeholder="INE009A01021" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          </div>
          <div className={styles.sectorDropdownWrapper}>
            <Label ch="Sector / Category" hint="— optional" />
            <input
              value={form.sector}
              onChange={e => { setF('sector', e.target.value); setSectorOpen(true); }}
              onFocus={() => setSectorOpen(true)}
              onBlur={() => setTimeout(() => setSectorOpen(false), 160)}
              placeholder="e.g. Banking, Large Cap"
            />
            {sectorOpen && !form.sector && (
              <div className={styles.sectorDropdown}>
                {SECTOR_SUGGESTIONS.map((s, i) => (
                  <div key={i} className={styles.sectorOption} onMouseDown={() => { setF('sector', s); setSectorOpen(false); }}>{s}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview pill */}
      {form.symbol && (
        <div className={styles.previewPill}>
          <span className={styles.previewPillLabel}>Saving as:</span>
          <span className={styles.previewPillSymbol} style={{ color: exchColors[exchange] }}>{form.symbol}</span>
          <Badge label={exchange} color={exchColors[exchange]} bg={`${exchColors[exchange]}15`} border={`${exchColors[exchange]}30`} />
          <Badge label={assetType} color={typeColors[assetType]} bg={`${typeColors[assetType]}15`} border={`${typeColors[assetType]}30`} />
          {form.isin   && <span className={styles.previewIsin}>{form.isin}</span>}
          {form.sector && <span className={styles.previewSector}>{form.sector}</span>}
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
  const { toast } = usePortfolio();
  const {
    files, parsed, importing, progress, result, dragOver,
    setDragOver, readFiles, handleImport,
  } = useBulkImport({ onImported, toast });
  const inputRef = useRef(null);

  return (
    <div className={`glass ${styles.bulkPanel}`}>
      <div className={styles.bulkTitle}>📂 Bulk Import from CSV</div>
      <div className={styles.bulkSub}>
        Upload BSE, NSE or ETF CSV files. File type is auto-detected. Duplicates are updated, not duplicated.
      </div>

      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
        onDrop={e => { e.preventDefault(); setDragOver(false); readFiles(e.dataTransfer.files); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
      >
        <div className={styles.dropZoneIcon}>📄</div>
        <div className={styles.dropZoneTitle}>Drop CSV files here or click to browse</div>
        <div className={styles.dropZoneSub}>bse_equity.csv · nse_equity.csv · ETF_list.csv</div>
        <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: 'none' }} onChange={e => readFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((f, i) => (
            <div key={i} className={styles.fileItem}>
              <span>📄</span>
              <div className={styles.fileItemInfo}>
                <div className={styles.fileItemName}>{f.name}</div>
                <div className={styles.fileItemSize}>{(f.size / 1024).toFixed(0)} KB</div>
              </div>
              {f.count != null && (
                <Badge label={`${f.count.toLocaleString()} · ${typeLabel[f.type] || f.type}`}
                  color={typeColor[f.type] || 'var(--text2)'}
                  bg={`${typeColor[f.type] || '#999'}18`}
                  border={`${typeColor[f.type] || '#999'}30`}
                />
              )}
            </div>
          ))}
          <div className={styles.parsedCount}>
            Total: {parsed.length.toLocaleString()} instruments ready
          </div>
        </div>
      )}

      {importing && (
        <div className={styles.progressWrapper}>
          <div className={styles.progressHeader}>
            <span>Importing…</span><span>{progress}%</span>
          </div>
          <ProgressBar value={progress} max={100} color="var(--green2)" />
        </div>
      )}

      {result && (
        <div className={styles.importResult}>
          <div className={styles.importResultTitle}>✅ Import Complete</div>
          <div className={styles.importResultGrid}>
            {[['New', result.created, 'var(--green2)'], ['Updated', result.updated, 'var(--accent2)'], ['Skipped', result.skipped, 'var(--text3)']].map(([l, v, c]) => (
              <div key={l} className={styles.importResultCell}>
                <div className={styles.importResultValue} style={{ color: c }}>{v.toLocaleString()}</div>
                <div className={styles.importResultLabel}>{l}</div>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div className={styles.importErrors}>
              {result.errors.slice(0, 3).join(' · ')}{result.errors.length > 3 ? ` +${result.errors.length - 3} more` : ''}
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

// ── Data Sources Help ─────────────────────────────────────────────────────────

function DataSourcesHelp() {
  return (
    <div className={`glass ${styles.sourcesPanel}`}>
      <div className={styles.sourcesTitle}>📥 Download Official CSV Files</div>
      <div className={styles.sourcesList}>
        {[
          { label: 'NSE Equity List',  url: 'https://archives.nseindia.com/content/equities/EQUITY_L.csv',      badge: 'NSE',  color: 'var(--green2)' },
          { label: 'BSE Equity List',  url: 'https://www.bseindia.com/corporates/List_Scrips.aspx',              badge: 'BSE',  color: 'var(--orange)' },
          { label: 'NSE ETF List',     url: 'https://archives.nseindia.com/content/equities/eq_etfseclist.csv', badge: 'ETF',  color: 'var(--accent2)' },
          { label: 'AMFI Fund NAVAll', url: 'https://portal.amfiindia.com/spages/NAVAll.txt',                   badge: 'AMFI', color: 'var(--teal)' },
        ].map((s, i) => (
          <div key={i} className={styles.sourceItem}>
            <Badge label={s.badge} color={s.color} bg={`${s.color}18`} border={`${s.color}30`} />
            <span className={styles.sourceItemName}>{s.label}</span>
            <a href={s.url} target="_blank" rel="noreferrer" className={styles.sourceItemLink}>Open ↗</a>
          </div>
        ))}
      </div>
      <div className={styles.sourcesNote}>
        Download then drag into Bulk Import. File type is auto-detected from filename or column headers.
      </div>
    </div>
  );
}

// ── Instrument Browser Table ──────────────────────────────────────────────────

function InstrumentTable({ refresh }) {
  const { toast } = usePortfolio();
  const {
    instruments, loading, query, setQuery,
    assetFilter, setAssetFilter, page, setPage,
    deleting, handleDelete, hasPrev, hasNext,
  } = useInstrumentTable({ refresh });

  return (
    <div className={`glass ${styles.browserPanel}`}>
      <div className={styles.browserControls}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search symbol or name…" className={styles.browserSearch} />
        <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} className={styles.browserFilter}>
          <option value="">All Types</option>
          {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className={styles.browserCount}>{loading ? 'Loading…' : `${instruments.length} results`}</div>
      </div>
      <div className={styles.tableWrapper}>
        <table>
          <thead>
            <tr>
              <th>Symbol</th><th>Name</th><th>Exchange</th><th>Type</th>
              <th>Sector</th><th>ISIN</th><th>Price</th><th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {instruments.map(inst => (
              <tr key={inst.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent2)' }}>{inst.symbol}</td>
                <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inst.name}>{inst.name}</td>
                <td><Badge label={inst.exchange} color={exchColors[inst.exchange] || 'var(--text2)'} bg={`${exchColors[inst.exchange] || '#999'}15`} border={`${exchColors[inst.exchange] || '#999'}30`} /></td>
                <td><Badge label={inst.assetType} color={typeColors[inst.assetType] || 'var(--text2)'} bg={`${typeColors[inst.assetType] || '#999'}15`} border={`${typeColors[inst.assetType] || '#999'}30`} /></td>
                <td style={{ fontSize: 11, color: 'var(--text3)' }}>{inst.sector || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{inst.isin || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: inst.price ? 'var(--green2)' : 'var(--text3)' }}>
                  {inst.price ? `₹${parseFloat(inst.price).toFixed(2)}` : '—'}
                </td>
                <td>
                  <button className={styles.deleteRowBtn} onClick={() => handleDelete(inst, toast)} disabled={deleting === inst.id}>
                    {deleting === inst.id ? '…' : '✕'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && instruments.length === 0 && (
              <tr><td colSpan={8} className={styles.tableEmpty}>No instruments found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setPage(p => p - 1)} disabled={!hasPrev}>← Prev</button>
        <span className={styles.paginationPage}>Page {page}</span>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setPage(p => p + 1)} disabled={!hasNext}>Next →</button>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export default function InstrumentsView() {
  const [tableRefresh, setTableRefresh] = useState(0);
  const refresh = () => setTableRefresh(n => n + 1);

  return (
    <div className={`fade-up ${styles.wrapper}`}>

      <div className={styles.statsBanner}>
        {[
          { icon: '🏛', label: 'NSE Equities', desc: '2,360+ listed stocks',  color: 'var(--green2)' },
          { icon: '📊', label: 'BSE Equities', desc: '4,800+ listed stocks',  color: 'var(--orange)' },
          { icon: '💼', label: 'ETFs',          desc: '320+ index & thematic', color: 'var(--accent2)' },
          { icon: '📈', label: 'Mutual Funds',  desc: 'All AMFI schemes',     color: 'var(--teal)' },
        ].map((m, i) => (
          <div key={i} className={styles.statCard}>
            <div className={styles.statCardIcon}>{m.icon}</div>
            <div className={styles.statCardTitle} style={{ color: m.color }}>{m.label}</div>
            <div className={styles.statCardDesc}>{m.desc}</div>
          </div>
        ))}
      </div>

      <div className={styles.formLayout}>
        <AddInstrumentForm onAdded={refresh} />
        <div className={styles.formRightCol}>
          <BulkImportPanel onImported={refresh} />
          <DataSourcesHelp />
        </div>
      </div>

      <div className={styles.browserSection}>
        <div className={styles.browserTitle}>🔍 Instrument Browser</div>
        <InstrumentTable refresh={tableRefresh} />
      </div>
    </div>
  );
}
