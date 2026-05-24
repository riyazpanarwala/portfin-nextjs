'use client';

/**
 * BackfillView.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UI panel to backfill historical monthly snapshots from the first trade date
 * using Yahoo Finance (stocks) and mfapi.in (MFs).
 *
 * Shows:
 *  - Configuration (from-month, dry-run toggle)
 *  - Live streaming progress (price fetch + snapshot creation)
 *  - Per-symbol price coverage log
 *  - Month-by-month table of computed values
 *  - Final summary
 */

import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl } from '@/lib/store';

// ── colour helpers ────────────────────────────────────────────────────────────
const pnlColor = n => n >= 0 ? 'var(--green2)' : 'var(--red2)';

export default function BackfillView() {
  const { portfolioId, trades, setActiveView } = usePortfolio();

  // Config
  const firstTradeMonth = trades.length
    ? trades.reduce((a, b) => a.tradeDate < b.tradeDate ? a : b).tradeDate.slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  const [fromMonth,  setFromMonth]  = useState(firstTradeMonth);
  const [dryRun,     setDryRun]     = useState(true);
  const [running,    setRunning]    = useState(false);
  const [done,       setDone]       = useState(false);

  // Stream state
  const [progress,    setProgress]    = useState(0);
  const [statusMsg,   setStatusMsg]   = useState('');
  const [priceLog,    setPriceLog]    = useState([]);   // { symbol, months, assetType }
  const [snapshots,   setSnapshots]   = useState([]);   // computed month rows
  const [summary,     setSummary]     = useState(null); // { created, skipped, errors, months }
  const [streamError, setStreamError] = useState(null);

  const abortRef  = useRef(null);
  const logEndRef = useRef(null);

  // Auto-scroll the price log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [priceLog.length]);

  async function startBackfill() {
    setRunning(true);
    setDone(false);
    setProgress(0);
    setStatusMsg('Connecting…');
    setPriceLog([]);
    setSnapshots([]);
    setSummary(null);
    setStreamError(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/backfill-snapshots', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ portfolioId, fromMonth, dryRun }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      while (true) {
        const { done: rdDone, value } = await reader.read();
        if (rdDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            handleMessage(msg);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStreamError(err.message);
      }
    } finally {
      setRunning(false);
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'progress':
        setProgress(msg.pct ?? 0);
        setStatusMsg(msg.step ?? '');
        break;

      case 'pricesFetched':
        setPriceLog(prev => [...prev, {
          symbol:    msg.symbol,
          months:    msg.months,
          assetType: msg.assetType,
        }]);
        break;

      case 'snapshot':
        setProgress(msg.pct ?? 0);
        setSnapshots(prev => [...prev, msg]);
        break;

      case 'done':
        setProgress(100);
        setStatusMsg(msg.dryRun ? 'Dry-run complete — no data was saved.' : 'Backfill complete!');
        setSummary(msg);
        setDone(true);
        break;

      case 'error':
        setStreamError(msg.message);
        break;
    }
  }

  function abort() {
    abortRef.current?.abort();
    setRunning(false);
    setStatusMsg('Cancelled.');
  }

  const totalSymbols = trades.length
    ? [...new Set(trades.map(t => t.symbol))].length
    : 0;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="glass" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #10b981, #14b8a6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>📅</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Historical Snapshot Backfill
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Reconstructs month-by-month portfolio values using Yahoo Finance (stocks)
              and AMFI historical NAV (MFs). Creates one snapshot per month.
            </div>
          </div>
        </div>

        {/* Info strip */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16,
        }}>
          {[
            { l: 'First trade', v: firstTradeMonth },
            { l: 'Unique symbols', v: totalSymbols },
            { l: 'Stocks', v: [...new Set(trades.filter(t => t.assetType === 'STOCK').map(t => t.symbol))].length },
            { l: 'Mutual Funds', v: [...new Set(trades.filter(t => t.assetType === 'MF').map(t => t.symbol))].length },
          ].map((m, i) => (
            <div key={i} style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 14px',
            }}>
              <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{m.l}</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Config row */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Backfill from month
            </label>
            <input
              type="month"
              value={fromMonth}
              onChange={e => setFromMonth(e.target.value)}
              disabled={running}
              style={{ width: 160 }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <div
              onClick={() => !running && setDryRun(d => !d)}
              style={{
                width: 36, height: 20, borderRadius: 10,
                background: dryRun ? 'var(--accent)' : 'var(--bg3)',
                border: '1px solid var(--border)',
                position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: dryRun ? 18 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                Dry-run {dryRun ? '(preview only)' : '(WILL SAVE to DB)'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {dryRun ? 'No snapshots will be created — just shows what would happen.' : 'Will create snapshots in the database.'}
              </div>
            </div>
          </label>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {running ? (
              <button className="btn btn-ghost" onClick={abort} style={{ color: 'var(--red2)', borderColor: 'rgba(239,68,68,0.4)' }}>
                ✕ Cancel
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={startBackfill}
                disabled={!portfolioId || !trades.length}
                style={{ background: dryRun ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {dryRun ? '🔍 Preview Backfill' : '📅 Run Backfill'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      {(running || done || streamError) && (
        <div className="glass" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{statusMsg}</span>
            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent2)', fontWeight: 700 }}>{progress}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${progress}%`,
              background: streamError
                ? 'var(--red2)'
                : done
                ? 'linear-gradient(90deg, var(--green), var(--teal))'
                : 'linear-gradient(90deg, var(--accent), var(--purple))',
              transition: 'width 0.4s ease, background 0.3s',
            }} />
          </div>

          {streamError && (
            <div style={{
              marginTop: 10, padding: '10px 14px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, fontSize: 12, color: 'var(--red2)',
            }}>
              ✕ {streamError}
            </div>
          )}
        </div>
      )}

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      {summary && (
        <div className="glass" style={{
          padding: '16px 20px',
          background: summary.errors?.length
            ? 'rgba(245,158,11,0.05)'
            : 'rgba(16,185,129,0.06)',
          border: `1px solid ${summary.errors?.length ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            {dryRun ? '🔍 Dry-run summary' : '✅ Backfill complete'}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: summary.errors?.length ? 10 : 0 }}>
            {[
              { l: 'Months planned',    v: summary.months,   c: 'var(--text)' },
              { l: dryRun ? 'Would create' : 'Created',  v: summary.created,  c: 'var(--green2)' },
              { l: 'Skipped',           v: summary.skipped,  c: 'var(--text3)' },
              { l: 'Errors',            v: summary.errors?.length ?? 0, c: summary.errors?.length ? 'var(--red2)' : 'var(--text3)' },
            ].map((m, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{m.l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>
          {summary.errors?.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.8 }}>
              {summary.errors.slice(0, 5).map((e, i) => <div key={i}>⚠ {e}</div>)}
              {summary.errors.length > 5 && <div>…and {summary.errors.length - 5} more</div>}
            </div>
          )}
          {!dryRun && summary.created > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => setActiveView('vs-nifty')}
              style={{ marginTop: 12, padding: '8px 20px' }}
            >
              📈 View Benchmark Comparison →
            </button>
          )}
        </div>
      )}

      {/* ── Two-column: price log + month snapshots ─────────────────────────  */}
      {(priceLog.length > 0 || snapshots.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>

          {/* Price fetch log */}
          <div className="glass" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                Price Coverage
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                {priceLog.length} / {totalSymbols} symbols fetched
              </div>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', padding: '8px 0' }}>
              {priceLog.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 14px',
                  borderBottom: i < priceLog.length - 1 ? '1px solid rgba(45,64,96,0.3)' : 'none',
                }}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.symbol}</span>
                    <span style={{
                      marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                      borderRadius: 3,
                      background: p.assetType === 'MF' ? 'rgba(59,130,246,0.15)' : 'rgba(139,92,246,0.15)',
                      color: p.assetType === 'MF' ? 'var(--accent2)' : 'var(--purple)',
                      border: `1px solid ${p.assetType === 'MF' ? 'rgba(59,130,246,0.3)' : 'rgba(139,92,246,0.3)'}`,
                    }}>{p.assetType}</span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    {p.months > 0 ? (
                      <span style={{ color: 'var(--green2)', fontWeight: 700 }}>{p.months}mo ✓</span>
                    ) : (
                      <span style={{ color: 'var(--red2)' }}>0 ✗</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Month-by-month snapshot table */}
          <div className="glass" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                  Monthly Portfolio Values
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                  {snapshots.length} months computed
                </div>
              </div>
              {dryRun && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                  background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                  color: 'var(--accent2)',
                }}>DRY RUN — not saved</span>
              )}
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'right' }}>Portfolio Value</th>
                    <th style={{ textAlign: 'right' }}>Invested</th>
                    <th style={{ textAlign: 'right' }}>Gain</th>
                    <th style={{ textAlign: 'right' }}>Return%</th>
                    <th style={{ textAlign: 'right' }}>MF CAGR</th>
                    <th style={{ textAlign: 'right' }}>Stk CAGR</th>
                    <th style={{ textAlign: 'right', fontSize: 9 }}>Prices</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snapshots].reverse().map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{s.month}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>{fmtCr(s.totalValue)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', textAlign: 'right' }}>{fmtCr(s.totalInvested)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: pnlColor(s.totalGain), fontWeight: 600, textAlign: 'right' }}>
                        {s.totalGain >= 0 ? '+' : ''}{fmtCr(s.totalGain)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`chip ${s.returnPct >= 0 ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 10 }}>
                          {s.returnPct >= 0 ? '+' : ''}{fmt(s.returnPct, 1)}%
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)', textAlign: 'right', fontSize: 11 }}>
                        {s.mfCagr ? `${fmt(s.mfCagr, 1)}%` : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)', textAlign: 'right', fontSize: 11 }}>
                        {s.stCagr ? `${fmt(s.stCagr, 1)}%` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 10, color: s.pricesCovered < s.totalSymbols ? 'var(--yellow)' : 'var(--text3)' }}>
                        {s.pricesCovered}/{s.totalSymbols}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── How it works ───────────────────────────────────────────────────── */}
      {!running && !done && (
        <div className="glass" style={{ padding: '16px 20px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent2)', marginBottom: 10 }}>How it works</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { icon: '📊', title: 'Fetches historical prices', desc: 'Yahoo Finance for stocks (monthly OHLCV), mfapi.in for MF NAV history (free AMFI wrapper).' },
              { icon: '🔄', title: 'Runs FIFO engine', desc: 'For each month, uses all trades up to that date + historical price to compute exact portfolio value.' },
              { icon: '📸', title: 'Creates snapshots', desc: 'Saves one snapshot per month at midnight UTC. These feed the vs-Nifty benchmark comparison.' },
              { icon: '⚠️', title: 'Price gaps', desc: 'Symbols with no historical data (e.g. delisted) use the last known price. Coverage shown per symbol.' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>{s.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 11, color: 'var(--yellow)' }}>
            ⚠ Run dry-run first to see what will be created. The backfill may take several minutes for large portfolios — stocks are fetched one-by-one from Yahoo Finance.
          </div>
        </div>
      )}
    </div>
  );
}
