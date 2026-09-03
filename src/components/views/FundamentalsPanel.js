'use client';

import { useState, useEffect, useMemo } from 'react';
import { fmtCr, fmt } from '@/lib/store';
import styles from './HoldingsTable.module.css';

export default function FundamentalsPanel({ holdings = [] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ fundamentals: {}, summary: null });
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('marketValue');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchFundamentals = async (force = false) => {
    if (!holdings.length) return;
    setLoading(true);
    setError(null);

    try {
      const payload = holdings.map((h) => ({
        symbol: h.symbol,
        exchange: h.exchange || 'NSE',
        marketValue: h.marketValue || 0,
      }));

      const res = await fetch('/api/fundamentals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: payload, force }),
      });

      if (!res.ok) throw new Error('Failed to fetch fundamental metrics');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('[FundamentalsPanel] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFundamentals(false);
  }, [holdings.length]);

  const summary = data.summary;
  const fundamentals = data.fundamentals || {};

  // Table rows combined with holdings + fundamental data
  const tableRows = useMemo(() => {
    return holdings
      .map((h) => {
        const f = fundamentals[h.symbol] || {};
        return {
          ...h,
          pe: f.pe ?? null,
          forwardPE: f.forwardPE ?? null,
          pb: f.pb ?? null,
          roe: f.roe ?? null,
          debtToEquity: f.debtToEquity ?? null,
          marketCapCr: f.marketCapCr ?? null,
          marketCapClass: f.marketCapClass ?? 'UNKNOWN',
          flags: f.flags || [],
        };
      })
      .filter((r) => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return (
          r.symbol.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (valA === null || valA === undefined) valA = sortAsc ? Infinity : -Infinity;
        if (valB === null || valB === undefined) valB = sortAsc ? Infinity : -Infinity;

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [holdings, fundamentals, filter, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getPEStatus = (pe) => {
    if (!pe) return null;
    if (pe < 18) return { label: 'Value / Discount', color: '#10B981' };
    if (pe <= 28) return { label: 'Fair / GARP', color: '#3B82F6' };
    return { label: 'Premium / Growth', color: '#F59E0B' };
  };

  const peStatus = summary?.weightedPE ? getPEStatus(summary.weightedPE) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 10 }}>
      {/* Header bar */}
      <div
        className="glass"
        style={{
          padding: '16px 20px',
          borderRadius: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📈</span> Equity Valuation & Fundamentals Scanner
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Live fundamental ratios fetched on-demand via Yahoo Finance · 0 Database Storage
          </div>
        </div>

        <button
          onClick={() => fetchFundamentals(true)}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: 'var(--purple)',
            color: '#fff',
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {loading ? 'Fetching Fundamentals…' : '↻ Refresh Fundamentals'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444', fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* Summary KPI Cards Grid */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {/* Card 1: Weighted Portfolio P/E */}
          <div className="glass" style={{ padding: '16px 18px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Portfolio Weighted P/E
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
                {summary.weightedPE ? `${summary.weightedPE}x` : 'N/A'}
              </span>
              {peStatus && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: `${peStatus.color}20`,
                    color: peStatus.color,
                    border: `1px solid ${peStatus.color}40`,
                  }}
                >
                  {peStatus.label}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Benchmark Nifty 50 P/E: <strong>{summary.niftyPE}x</strong>
            </div>
          </div>

          {/* Card 2: Weighted Portfolio P/B */}
          <div className="glass" style={{ padding: '16px 18px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Portfolio Weighted P/B
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginTop: 8 }}>
              {summary.weightedPB ? `${summary.weightedPB}x` : 'N/A'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Price-to-Book value ratio across equity positions
            </div>
          </div>

          {/* Card 3: Market Cap Class Distribution */}
          <div className="glass" style={{ padding: '16px 18px', borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Market Cap Distribution
            </div>
            {/* Multi-segment progress bar */}
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--bg3)', marginBottom: 8 }}>
              <div style={{ width: `${summary.marketCapBreakdown.large}%`, background: '#3B82F6' }} title={`Large Cap: ${summary.marketCapBreakdown.large}%`} />
              <div style={{ width: `${summary.marketCapBreakdown.mid}%`, background: '#10B981' }} title={`Mid Cap: ${summary.marketCapBreakdown.mid}%`} />
              <div style={{ width: `${summary.marketCapBreakdown.small}%`, background: '#F59E0B' }} title={`Small Cap: ${summary.marketCapBreakdown.small}%`} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text)' }}>
              <span><strong style={{ color: '#3B82F6' }}>Large:</strong> {summary.marketCapBreakdown.large}%</span>
              <span><strong style={{ color: '#10B981' }}>Mid:</strong> {summary.marketCapBreakdown.mid}%</span>
              <span><strong style={{ color: '#F59E0B' }}>Small:</strong> {summary.marketCapBreakdown.small}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter symbol / company name…"
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            minWidth: 220,
          }}
        />
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Showing {tableRows.length} of {holdings.length} stocks
        </div>
      </div>

      {/* Fundamentals Table */}
      <div className="glass" style={{ borderRadius: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => handleSort('symbol')}>
                STOCK {sortField === 'symbol' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => handleSort('marketCapClass')}>
                CAP CLASS {sortField === 'marketCapClass' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('cmp')}>
                CMP (₹) {sortField === 'cmp' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('pe')}>
                P/E {sortField === 'pe' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('forwardPE')}>
                FWD P/E {sortField === 'forwardPE' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('pb')}>
                P/B {sortField === 'pb' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('roe')}>
                ROE % {sortField === 'roe' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('debtToEquity')}>
                DEBT/EQ {sortField === 'debtToEquity' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('marketCapCr')}>
                M.CAP (CR) {sortField === 'marketCapCr' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ padding: '10px 12px' }}>RISK FLAGS</th>
            </tr>
          </thead>
          <tbody>
            {loading && !tableRows.length ? (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading fundamental data from Yahoo Finance…
                </td>
              </tr>
            ) : tableRows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No matching stock holdings found.
                </td>
              </tr>
            ) : (
              tableRows.map((r) => {
                const capBadgeColor =
                  r.marketCapClass === 'LARGE' ? '#3B82F6' : r.marketCapClass === 'MID' ? '#10B981' : r.marketCapClass === 'SMALL' ? '#F59E0B' : '#9CA3AF';

                return (
                  <tr key={r.symbol} style={{ borderBottom: '1px solid var(--border)', hover: { background: 'rgba(255,255,255,0.01)' } }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{r.symbol}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: `${capBadgeColor}15`,
                          color: capBadgeColor,
                          border: `1px solid ${capBadgeColor}30`,
                        }}
                      >
                        {r.marketCapClass}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                      ₹{fmt(r.cmp)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: r.pe && r.pe > 50 ? '#F59E0B' : 'var(--text)' }}>
                      {r.pe !== null ? `${r.pe}x` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {r.forwardPE !== null ? `${r.forwardPE}x` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {r.pb !== null ? `${r.pb}x` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: r.roe && r.roe > 15 ? '#10B981' : 'var(--text)' }}>
                      {r.roe !== null ? `${r.roe}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: r.debtToEquity && r.debtToEquity > 1.5 ? '#EF4444' : 'var(--text)' }}>
                      {r.debtToEquity !== null ? r.debtToEquity : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {r.marketCapCr ? `₹${fmt(r.marketCapCr)}` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {r.flags && r.flags.length > 0 ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {r.flags.map((flag) => (
                            <span
                              key={flag.type}
                              title={flag.label}
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: flag.type === 'HIGH_VALUATION' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: flag.type === 'HIGH_VALUATION' ? '#F59E0B' : '#EF4444',
                                border: flag.type === 'HIGH_VALUATION' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                              }}
                            >
                              {flag.type === 'HIGH_VALUATION' ? '⚠️ High P/E' : flag.type === 'HIGH_LEVERAGE' ? '🔴 High Debt' : '🟡 Low ROE'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: '#10B981' }}>✓ Normal</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
