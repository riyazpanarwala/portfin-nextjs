'use client';

import { useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, chipPnl, sectorColor } from '@/lib/store';
import { DonutChart } from '@/components/charts/Charts';

export default function StocksView() {
  const { stHoldings, stats, setActiveView } = usePortfolio();
  const [sort, setSort]     = useState({ key: 'marketValue', dir: -1 });
  const [filter, setFilter] = useState('');

  if (!stHoldings.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '12px' }}>
        <div style={{ fontSize: '40px' }}>◐</div>
        <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>No stock holdings yet</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Add trades with Asset Type = STOCK to see them here.</div>
        <button className="btn btn-primary" onClick={() => setActiveView('trade')}>+ Add Stock Trade</button>
      </div>
    );
  }

  const sorted = [...stHoldings]
    .filter(h => h.symbol.toLowerCase().includes(filter.toLowerCase()) || (h.sector || '').toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => sort.dir * ((a[sort.key] ?? 0) < (b[sort.key] ?? 0) ? -1 : 1));

  function toggleSort(key) { setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }); }

  function exportCSV() {
    const rows = [['Stock','Sector','Qty','Avg Buy','CMP','Invested','Mkt Value','P&L','Return%','CAGR','Holding']];
    sorted.forEach(h => rows.push([h.symbol, h.sector || '', h.qty, fmt(h.avgBuy,1), fmt(h.cmp,1), fmt(h.invested,0), fmt(h.marketValue,0), fmt(h.gain,0), fmtPct(h.returnPct), fmtPct(h.cagr), h.holdingDays + 'd']));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(csv); a.download = 'stocks.csv'; a.click();
  }

  const sectorMap = {};
  stHoldings.forEach(h => { sectorMap[h.sector || 'Other'] = (sectorMap[h.sector || 'Other'] || 0) + h.marketValue; });
  const sectorData = Object.entries(sectorMap).map(([label, value]) => ({
    label, value, color: sectorColor(label), pct: stats.stValue > 0 ? (value / stats.stValue) * 100 : 0,
  }));
  const stGain = stats.stValue - stats.stInvested;

  return (
    <div className="fade-up">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Stock Value', value: fmtCr(stats.stValue),    color: 'var(--purple)' },
          { label: 'Invested',    value: fmtCr(stats.stInvested), color: 'var(--text)' },
          { label: 'P&L',        value: fmtCr(stGain),            color: colorPnl(stGain) },
          { label: 'Return',     value: fmtPct(stats.stInvested > 0 ? stGain / stats.stInvested * 100 : 0), color: colorPnl(stGain) },
          { label: 'Stocks',     value: stats.stockCount,          color: 'var(--accent2)' },
        ].map((m, i) => (
          <div key={i} className="metric-card">
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {sectorData.length > 0 && (
        <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Sector Breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '24px', alignItems: 'center' }}>
            <DonutChart data={sectorData} size={140} showLegend={false} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
              {sectorData.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg3)', borderRadius: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>{s.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{s.pct.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="glass" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Stock Holdings ({sorted.length})</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…" style={{ width: '160px' }} />
            <button className="btn btn-ghost" onClick={exportCSV}>⬇ CSV</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                {[['symbol','Stock'],['sector','Sector'],['qty','Qty'],['avgBuy','Avg Buy'],['cmp','CMP'],['invested','Invested'],['marketValue','Value'],['gain','P&L'],['returnPct','Return%'],['cagr','CAGR'],['holdingDays','Held']].map(([key, label]) => (
                  <th key={key} onClick={() => toggleSort(key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((h, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: '700' }}>{h.symbol}</td>
                  <td><span className="chip chip-blue">{h.sector || '—'}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{fmt(h.qty, 0)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>₹{fmt(h.avgBuy, 1)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>₹{fmt(h.cmp, 1)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtCr(h.invested)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{fmtCr(h.marketValue)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: colorPnl(h.gain), fontWeight: '600' }}>{fmtCr(h.gain)}</td>
                  <td><span className={chipPnl(h.returnPct)}>{fmtPct(h.returnPct, true)}</span></td>
                  <td><span className={chipPnl(h.cagr)}>{fmtPct(h.cagr, true)}</span></td>
                  <td style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>{h.holdingDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
