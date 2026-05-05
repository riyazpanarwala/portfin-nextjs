'use client';

import { useState, useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import {
  pct, pcol, holdStr, SORTS,
  ReturnBar, HoldingDetailPanel, HoldingControls,
  HoldingsEmpty, HoldingsControls,
} from '@/components/views/HoldingsShared';

// ── Grid column definition ────────────────────────────────────────────────────
const COL = '20px 1fr 80px 32px 72px 72px 80px 80px 80px 88px 64px 130px 50px';

function HeaderRow() {
  const cols = ['', 'FUND NAME', 'CAT', '#', 'UNITS', 'CMP', 'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '0 6px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
      {cols.map((c, i) => (
        <div key={i} style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
          color: i === 8 ? 'var(--yellow)' : 'var(--text3)',
          padding: '7px 5px', textAlign: i > 2 ? 'right' : 'left', whiteSpace: 'nowrap',
        }}>{c}</div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MFView() {
  const { mfHoldings, stats, setActiveView, priceMeta } = usePortfolio();
  const [sort, setSort]         = useState({ key: 'returnPct', dir: -1 });
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState({});

  const categories = useMemo(() =>
    ['All', ...[...new Set(mfHoldings.map(h => h.sector || 'Other'))].sort()],
  [mfHoldings]);

  const rows = useMemo(() => {
    let list = category === 'All' ? [...mfHoldings] : mfHoldings.filter(h => (h.sector || 'Other') === category);
    const k  = sort.key;
    list.sort((a, b) => sort.dir * ((k === 'lots' ? a.lots.length - b.lots.length : (a[k] ?? 0) - (b[k] ?? 0))));
    return list;
  }, [mfHoldings, category, sort]);

  const maxRet     = useMemo(() => Math.max(...mfHoldings.map(h => Math.abs(h.returnPct)), 1), [mfHoldings]);
  const mfGain     = stats.mfValue - stats.mfInvested;
  const mfRealized = mfHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0);

  if (!mfHoldings.length) return (
    <HoldingsEmpty icon="◎" label="No mutual funds yet" cta="+ Add MF Trade" onCta={() => setActiveView('trade')} />
  );

  function toggleSort(k) { setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 }); }
  function toggle(sym)    { setExpanded(e => ({ ...e, [sym]: !e[sym] })); }

  function exportCSV() {
    const rows2 = [['Fund', 'Category', 'Lots', 'Units', 'CMP', 'Avg NAV', 'Invested', 'Value', 'Unrealized', 'Realized', 'Total Gain', 'Return%', 'CAGR', 'Holding']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector || '', h.lots.length, fmt(h.qty, 3), fmt(h.cmp, 2), fmt(h.avgBuy, 2),
      fmt(h.invested, 0), fmt(h.marketValue, 0), fmt(h.unrealizedGain, 0), fmt(h.realizedGain, 0),
      fmt(h.totalGain, 0), fmt(h.returnPct, 2) + '%', fmt(h.cagr, 2) + '%', holdStr(h.holdingDays),
    ]));
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(rows2.map(r => r.join(',')).join('\n'));
    a.download = 'mf.csv'; a.click();
  }

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        {[
          { l: 'MF Value',      v: fmtCr(stats.mfValue),    c: 'var(--teal)'    },
          { l: 'Invested',      v: fmtCr(stats.mfInvested), c: 'var(--text)'    },
          { l: 'Unrealized',    v: fmtCr(mfGain),            c: colorPnl(mfGain) },
          { l: 'Realized P&L', v: fmtCr(mfRealized),        c: colorPnl(mfRealized) },
          { l: 'Wtd CAGR',      v: `${mfGain >= 0 ? '+' : ''}${fmt(stats.mfCagr)}%`, c: 'var(--green2)' },
          { l: 'Funds',         v: stats.fundCount,           c: 'var(--accent2)' },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{m.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>

      <HoldingsControls
        groupLabel="CATEGORY"
        groups={categories}
        activeGroup={category}
        onGroupChange={setCategory}
        sort={sort}
        onSortToggle={toggleSort}
        onExport={exportCSV}
      />

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <HeaderRow />
        {rows.map(h => {
          const open        = !!expanded[h.symbol];
          const hasRealized = (h.realizedGain || 0) !== 0;
          return (
            <div key={h.symbol} style={{ borderBottom: '1px solid rgba(45,64,96,0.35)' }}>
              <div
                onClick={() => toggle(h.symbol)}
                style={{
                  display: 'grid', gridTemplateColumns: COL,
                  padding: '0 6px', cursor: 'pointer', alignItems: 'center',
                  background: open ? 'rgba(59,130,246,0.07)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 8, padding: '0 2px' }}>{open ? '▼' : '►'}</div>

                {/* Fund name */}
                <div style={{ padding: '9px 5px', minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.name || h.symbol}>{h.symbol}</div>
                  {h.name && h.name !== h.symbol && (
                    <div style={{ fontSize: 9, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                  )}
                  {h.sells?.length > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--yellow)', marginTop: 1 }}>{h.sells.length} redemption{h.sells.length > 1 ? 's' : ''}</div>
                  )}
                </div>

                {/* Category badge */}
                <div style={{ padding: '9px 5px' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 4, whiteSpace: 'nowrap',
                    background: `${sectorColor(h.sector || 'Other')}20`, color: sectorColor(h.sector || 'Other'),
                    border: `1px solid ${sectorColor(h.sector || 'Other')}40`,
                  }}>{h.sector || 'Other'}</span>
                </div>

                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>{h.lots.length}</div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>{fmt(h.qty, 2)}</div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>₹{fmt(h.cmp, 1)}</div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmtCr(h.invested)}</div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>{fmtCr(h.marketValue)}</div>

                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: hasRealized ? colorPnl(h.realizedGain) : 'var(--text3)' }}>
                  {hasRealized ? fmtCr(h.realizedGain) : '—'}
                </div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: colorPnl(h.unrealizedGain) }}>{fmtCr(h.unrealizedGain)}</div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: pcol(h.cagr) }}>{pct(h.cagr)}</div>
                <div style={{ padding: '9px 5px' }}><ReturnBar val={h.returnPct} max={maxRet} /></div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)' }}>{holdStr(h.holdingDays)}</div>
              </div>

              {open && (
                <HoldingDetailPanel
                  h={h}
                  priceMeta={priceMeta}
                  qtyDecimals={3}
                  xirrLabel="Fund XIRR"
                  chartLabel="Investment Path vs Current NAV"
                />
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No funds match the selected filter.</div>
        )}
      </div>
    </div>
  );
}
