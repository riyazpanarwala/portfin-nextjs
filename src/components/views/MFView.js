'use client';

import { useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmtPct, fmt, colorPnl, chipPnl, sectorColor } from '@/lib/store';
import { HBar } from '@/components/charts/Charts';

export default function MFView() {
  const { mfHoldings, stats, setActiveView } = usePortfolio();
  const [sort, setSort] = useState({ key: 'marketValue', dir: -1 });
  const [filter, setFilter] = useState('');

  if (!mfHoldings.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '12px' }}>
        <div style={{ fontSize: '40px' }}>◎</div>
        <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>No mutual funds yet</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Add MF trades with Asset Type = MF to see them here.</div>
        <button className="btn btn-primary" onClick={() => setActiveView('trade')}>+ Add MF Trade</button>
      </div>
    );
  }

  const sorted = [...mfHoldings]
    .filter(h => h.symbol.toLowerCase().includes(filter.toLowerCase()) || (h.sector || '').toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => sort.dir * ((a[sort.key] ?? 0) < (b[sort.key] ?? 0) ? -1 : 1));

  function toggleSort(key) { setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }); }

  function exportCSV() {
    const rows = [['Fund Name','Category','Lots','Avg NAV','Invested','Curr Value','Gain','Return%','CAGR','Holding Days']];
    sorted.forEach(h => rows.push([h.symbol, h.sector || '', h.lots.length, fmt(h.avgBuy), fmt(h.invested,0), fmt(h.marketValue,0), fmt(h.gain,0), fmtPct(h.returnPct), fmtPct(h.cagr), h.holdingDays]));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(csv); a.download = 'mf_portfolio.csv'; a.click();
  }

  const catMap = {};
  mfHoldings.forEach(h => { catMap[h.sector || 'Other'] = (catMap[h.sector || 'Other'] || 0) + h.marketValue; });
  const mfGain = stats.mfValue - stats.mfInvested;

  return (
    <div className="fade-up">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'MF Total Value', value: fmtCr(stats.mfValue),    color: 'var(--teal)' },
          { label: 'MF Invested',    value: fmtCr(stats.mfInvested), color: 'var(--text)' },
          { label: 'MF Gain',        value: fmtCr(mfGain),            color: colorPnl(mfGain) },
          { label: 'Weighted CAGR',  value: fmtPct(stats.mfCagr),    color: 'var(--green2)' },
          { label: 'No. of Funds',   value: stats.fundCount,          color: 'var(--accent2)' },
        ].map((m, i) => (
          <div key={i} className="metric-card">
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>{m.label}</div>
            <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {Object.keys(catMap).length > 0 && (
        <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Category Breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
            {Object.entries(catMap).map(([cat, val], i) => (
              <HBar key={i} label={cat} value={val} max={stats.mfValue} color={sectorColor(cat)} sub={fmt(val / (stats.mfValue || 1) * 100, 1) + '%'} />
            ))}
          </div>
        </div>
      )}

      <div className="glass" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Mutual Fund Holdings ({sorted.length})</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…" style={{ width: '180px' }} />
            <button className="btn btn-ghost" onClick={exportCSV}>⬇ CSV</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                {[['symbol','Fund Name'],['sector','Category'],['lots','Lots'],['avgBuy','Avg NAV'],['qty','Units'],['cmp','CMP'],['invested','Invested'],['marketValue','Value'],['gain','Gain/Loss'],['returnPct','Return%'],['cagr','CAGR'],['holdingDays','Holding']].map(([key, label]) => (
                  <th key={key} onClick={() => toggleSort(key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((h, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: '600', color: 'var(--text)', minWidth: '200px' }}>{h.symbol}</td>
                  <td><span className="chip chip-blue">{h.sector || '—'}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{h.lots.length}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>₹{fmt(h.avgBuy)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{fmt(h.qty, 4)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>₹{fmt(h.cmp)}</td>
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
