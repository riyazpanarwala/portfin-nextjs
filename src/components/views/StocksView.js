'use client';

import { useState, useMemo } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, colorPnl, sectorColor } from '@/lib/store';
import {
  pct, pcol, holdStr, SORTS,
  ReturnBar, PriceCell, HoldingDetailPanel,
  HoldingsEmpty, HoldingsControls,
} from '@/components/views/HoldingsShared';

// ── Grid column definition ─────────────────────────────────────────────────────
const COL = '20px 1fr 120px 32px 72px 110px 80px 80px 80px 88px 64px 130px 50px';

function HeaderRow() {
  const cols = ['', 'STOCK', 'SECTOR', '#', 'QTY', 'CMP ✎', 'INVESTED', 'VALUE', 'REALIZED', 'GAIN', 'CAGR', 'RETURN %', 'HOLD'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '0 6px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
      {cols.map((c, i) => (
        <div key={i} style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
          color: i === 5 ? 'var(--accent2)' : i === 8 ? 'var(--yellow)' : 'var(--text3)',
          padding: '7px 5px', textAlign: i > 2 ? 'right' : 'left', whiteSpace: 'nowrap',
        }}>{c}</div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StocksView() {
  const { stHoldings, stats, setActiveView, priceMeta, realizedSummary } = usePortfolio();
  const [sort, setSort]         = useState({ key: 'returnPct', dir: -1 });
  const [sector, setSector]     = useState('All');
  const [filter, setFilter]     = useState('');
  const [expanded, setExpanded] = useState({});

  const sectors = useMemo(() =>
    ['All', ...[...new Set(stHoldings.map(h => h.sector || 'Other'))].sort()],
  [stHoldings]);

  const rows = useMemo(() => {
    let list = sector === 'All' ? [...stHoldings] : stHoldings.filter(h => (h.sector || 'Other') === sector);
    if (filter) list = list.filter(h =>
      h.symbol.toLowerCase().includes(filter.toLowerCase()) ||
      (h.sector || '').toLowerCase().includes(filter.toLowerCase()),
    );
    const k = sort.key;
    list.sort((a, b) => sort.dir * ((k === 'lots' ? a.lots.length - b.lots.length : (a[k] ?? 0) - (b[k] ?? 0))));
    return list;
  }, [stHoldings, sector, filter, sort]);

  const maxRet     = useMemo(() => Math.max(...stHoldings.map(h => Math.abs(h.returnPct)), 1), [stHoldings]);
  const stGain     = stats.stValue - stats.stInvested;
  const stRealized = useMemo(() => stHoldings.reduce((s, h) => s + (h.realizedGain || 0), 0), [stHoldings]);
  const stWins     = stHoldings.reduce((s, h) => s + (h.stats?.winCount  || 0), 0);
  const stLoss     = stHoldings.reduce((s, h) => s + (h.stats?.lossCount || 0), 0);

  if (!stHoldings.length) return (
    <HoldingsEmpty icon="◐" label="No stock holdings yet" cta="+ Add Stock Trade" onCta={() => setActiveView('trade')} />
  );

  function toggleSort(k) { setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: -1 }); }
  function toggle(sym)    { setExpanded(e => ({ ...e, [sym]: !e[sym] })); }

  function exportCSV() {
    const rows2 = [['Stock', 'Sector', 'Lots', 'Qty', 'CMP', 'Avg Buy', 'Invested', 'Value', 'Unrealized', 'Realized', 'Total Gain', 'Return%', 'CAGR', 'Holding']];
    rows.forEach(h => rows2.push([
      h.symbol, h.sector || '', h.lots.length, fmt(h.qty, 0), fmt(h.cmp, 2), fmt(h.avgBuy, 2),
      fmt(h.invested, 0), fmt(h.marketValue, 0), fmt(h.unrealizedGain, 0), fmt(h.realizedGain, 0),
      fmt(h.totalGain, 0), fmt(h.returnPct, 2) + '%', fmt(h.cagr, 2) + '%', holdStr(h.holdingDays),
    ]));
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(rows2.map(r => r.join(',')).join('\n'));
    a.download = 'stocks.csv'; a.click();
  }

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        {[
          { l: 'Stock Value',   v: fmtCr(stats.stValue),    c: 'var(--purple)'  },
          { l: 'Invested',      v: fmtCr(stats.stInvested), c: 'var(--text)'    },
          { l: 'Unrealized',    v: fmtCr(stGain),            c: colorPnl(stGain) },
          { l: 'Realized P&L', v: fmtCr(stRealized),        c: colorPnl(stRealized) },
          { l: 'Total Gain',    v: fmtCr(stGain + stRealized), c: colorPnl(stGain + stRealized) },
          { l: 'W / L',         v: `${stWins}W / ${stLoss}L`, c: stWins > stLoss ? 'var(--green2)' : 'var(--red2)' },
          { l: 'Stocks',        v: stats.stockCount,           c: 'var(--accent2)' },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{m.l}</div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-mono)', color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>

      <HoldingsControls
        groupLabel="SECTOR"
        groups={sectors}
        activeGroup={sector}
        onGroupChange={setSector}
        sort={sort}
        onSortToggle={toggleSort}
        onExport={exportCSV}
        extra={
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Search…" style={{ width: 90, padding: '3px 8px', fontSize: 11 }} />
        }
      />

      {/* Price edit hint */}
      <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
        <span style={{ color: 'var(--accent2)', fontWeight: 600 }}>✎</span>
        Click edit icon next to CMP to update price · Click row to expand lot details + sell history
      </div>

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
                <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 8 }}>{open ? '▼' : '►'}</div>

                {/* Symbol */}
                <div style={{ padding: '9px 5px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>{h.symbol}</div>
                  {h.sells?.length > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--yellow)', marginTop: 1 }}>{h.sells.length} sell{h.sells.length > 1 ? 's' : ''}</div>
                  )}
                </div>

                {/* Sector */}
                <div style={{ padding: '9px 5px', minWidth: 0 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 4, whiteSpace: 'nowrap',
                    display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                    background: `${sectorColor(h.sector || 'Other')}20`, color: sectorColor(h.sector || 'Other'),
                    border: `1px solid ${sectorColor(h.sector || 'Other')}40`,
                  }}>{h.sector || 'Other'}</span>
                </div>

                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>{h.lots.length}</div>
                <div style={{ padding: '9px 5px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)' }}>{fmt(h.qty, 0)}</div>

                {/* Editable CMP — stop propagation so click doesn't expand row */}
                <div onClick={e => e.stopPropagation()}>
                  <PriceCell symbol={h.symbol} cmp={h.cmp} />
                </div>

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
                  qtyDecimals={0}
                  xirrLabel="Stock XIRR"
                  chartLabel="Investment Path vs Current CMP"
                />
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No stocks match the selected filter.</div>
        )}
      </div>
    </div>
  );
}
