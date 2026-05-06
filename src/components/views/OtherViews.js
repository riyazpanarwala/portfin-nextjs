'use client';
export { TradeForm } from '@/components/views/TradeForm';

import { useState, useEffect } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { useSnapshots } from '@/hooks/useSnapshots';
import { fmtCr, fmt, fmtPct, colorPnl, sectorColor, buildMonthlyFlow } from '@/lib/store';
import { CumChart, WaterfallChart } from '@/components/charts/Charts';
import { EmptyState, Alert } from '@/components/ui/SharedUI';

// ─── Timeline View ────────────────────────────────────────────────────────────

export function TimelineView() {
  const { trades, monthlyFlow, setActiveView } = usePortfolio();

  const byMonth = {};
  [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).forEach(t => {
    const key = t.tradeDate.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(t);
  });

  const cumFlow = [];
  let cum = 0;
  monthlyFlow.forEach(m => { cum += m.amount; cumFlow.push({ ...m, cum }); });

  if (!trades.length) return (
    <EmptyState
      icon="📅"
      label="No trades recorded yet"
      sub="Add trades to see your investment timeline."
      cta="+ Add Trade"
      onCta={() => setActiveView('trade')}
    />
  );

  return (
    <div className="fade-up">
      <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>
          Cumulative Invested Over Time
        </div>
        <CumChart data={cumFlow} />
      </div>

      <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Monthly Investment Heatmap</div>
        <MonthlyHeatmap data={monthlyFlow} />
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Trade History</span>
          <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text3)' }}>· {trades.length} total trades</span>
        </div>
        {Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).map(([month, ts]) => (
          <div key={month}>
            <div style={{ padding: '10px 18px', background: 'var(--bg3)', fontSize: '12px', fontWeight: '700', color: 'var(--text2)', letterSpacing: '0.06em' }}>
              {new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              <span style={{ marginLeft: '8px', color: 'var(--text3)', fontWeight: '400' }}>· {ts.length} trade{ts.length > 1 ? 's' : ''}</span>
            </div>
            {ts.map((t, i) => (
              <div key={i} style={{ padding: '10px 18px', borderBottom: '1px solid rgba(45,64,96,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className={`chip ${t.tradeType === 'BUY' ? 'chip-green' : 'chip-red'}`}>{t.tradeType}</span>
                  <span className={`chip ${t.assetType === 'MF' ? 'chip-blue' : 'chip-purple'}`}>{t.assetType}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{t.symbol}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.tradeDate}{t.sector ? ` · ${t.sector}` : ''}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                    {parseFloat(t.quantity)} units @ ₹{fmt(parseFloat(t.price))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    = {fmtCr(parseFloat(t.quantity) * parseFloat(t.price))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyHeatmap({ data }) {
  if (!data || !data.length) return <div style={{ color: 'var(--text3)', fontSize: '12px' }}>No data</div>;
  const max = Math.max(...data.map(d => d.amount));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const byYear = {};
  data.forEach(d => {
    const [y, m] = d.month.split('-');
    if (!byYear[y]) byYear[y] = {};
    byYear[y][parseInt(m) - 1] = d.amount;
  });
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(12, 1fr)', gap: '3px', minWidth: '500px' }}>
        <div />
        {months.map(m => (
          <div key={m} style={{ fontSize: '10px', color: 'var(--text3)', textAlign: 'center', paddingBottom: '4px' }}>{m}</div>
        ))}
        {Object.entries(byYear).sort().map(([year, mdata]) => ([
          <div key={year + '_l'} style={{ fontSize: '11px', color: 'var(--text2)', display: 'flex', alignItems: 'center', fontWeight: '600' }}>{year}</div>,
          ...months.map((_, mi) => {
            const val = mdata[mi] || 0;
            const intensity = max > 0 ? val / max : 0;
            return (
              <div key={year + '_' + mi} title={val ? `₹${fmt(val, 0)}` : 'No investment'} style={{
                height: '28px', borderRadius: '4px',
                background: val > 0 ? `rgba(59,130,246,${0.1 + intensity * 0.8})` : 'var(--bg3)',
                border: '1px solid var(--border)', cursor: 'default',
              }} />
            );
          })
        ]))}
      </div>
    </div>
  );
}

// ─── Wealth Waterfall View ────────────────────────────────────────────────────

export function WaterfallView() {
  const { stats, holdings, setActiveView } = usePortfolio();

  if (!holdings.length) return (
    <EmptyState icon="💧" label="No holdings yet" sub="Add trades to see your wealth waterfall." cta="+ Add Trade" onCta={() => setActiveView('trade')} />
  );

  const mfGain = stats.mfValue - stats.mfInvested;
  const stGain = stats.stValue - stats.stInvested;

  const steps = [
    { label: 'MF Invested', value: stats.mfInvested, color: 'var(--teal)', pct: stats.totalValue > 0 ? stats.mfInvested / stats.totalValue * 100 : 0 },
    { label: 'Stock Invested', value: stats.stInvested, color: 'var(--purple)', pct: stats.totalValue > 0 ? stats.stInvested / stats.totalValue * 100 : 0 },
    { label: 'MF Gains', value: mfGain, color: mfGain >= 0 ? 'var(--green2)' : 'var(--red2)', pct: stats.totalValue > 0 ? mfGain / stats.totalValue * 100 : 0 },
    { label: 'Stock Gains', value: stGain, color: stGain >= 0 ? 'var(--green2)' : 'var(--red2)', pct: stats.totalValue > 0 ? stGain / stats.totalValue * 100 : 0 },
    { label: 'Total Portfolio', value: stats.totalValue, color: 'var(--accent2)', isTotal: true },
  ];

  return (
    <div className="fade-up">
      <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Wealth Waterfall</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '18px' }}>
          How your capital transformed into current portfolio value
        </div>
        <WaterfallChart steps={steps} />
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Waterfall Breakdown</span>
        </div>
        <table>
          <thead>
            <tr><th>Component</th><th>Amount</th><th>% of Total</th></tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={i}>
                <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.color }} />
                  {s.label}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: s.color }}>{fmtCr(s.value)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{s.isTotal ? '100%' : (s.pct ? fmt(s.pct, 1) + '%' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Action Signal View ───────────────────────────────────────────────────────

export function ActionView() {
  const { stats, holdings, setActiveView } = usePortfolio();
  const [checked, setChecked] = useState({});

  if (!holdings.length) return (
    <EmptyState icon="⚡" label="No holdings yet" sub="Add trades to see your action signals." cta="+ Add Trade" onCta={() => setActiveView('trade')} />
  );

  const topGainer = [...holdings].sort((a, b) => b.returnPct - a.returnPct)[0];
  const topLoser = [...holdings].sort((a, b) => a.returnPct - b.returnPct)[0];

  const checklist = [
    'Review all SIP amounts and due dates',
    'Check if any ELSS fund lock-in is ending',
    'Compare MF NAVs with previous month',
    'Review corporate actions (bonus, split, dividend) in stocks',
    'Check if portfolio drift exceeds 5% from target',
    'Verify folio statements match broker records',
    'Plan LTCG/STCG harvesting if year-end approaching',
    'Ensure nominees are updated in all folios',
  ];

  return (
    <div className="fade-up">
      {/* Today's signal */}
      <div className="glass" style={{ padding: '20px', marginBottom: '16px', background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.05))', border: '1px solid rgba(59,130,246,0.3)' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent2)', marginBottom: '8px' }}>⚡ Today's Signal</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '6px' }}>
          {stats.totalReturnPct >= 0 ? 'Portfolio is in profit — stay the course' : 'Portfolio is in loss — review allocation'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
          {stats.fundCount + stats.stockCount} holdings · Overall return {fmtPct(stats.totalReturnPct, true)} · CAGR {fmtPct(stats.overallCagr, true)}
        </div>
      </div>

      {/* Portfolio pulse — reuse Alert for consistent styling */}
      <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Portfolio Pulse</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {[
            { icon: '📈', title: 'Top Gainer', body: topGainer ? `${topGainer.symbol} ${fmtPct(topGainer.returnPct, true)}` : '—', color: 'var(--green2)' },
            { icon: '📉', title: 'Underperformer', body: topLoser ? `${topLoser.symbol}  ${fmtPct(topLoser.returnPct, true)}` : '—', color: 'var(--red2)' },
            { icon: '💰', title: 'Portfolio Value', body: fmtCr(stats.totalValue), color: 'var(--accent2)' },
            { icon: '📊', title: 'Overall Return', body: fmtPct(stats.totalReturnPct, true), color: colorPnl(stats.totalReturnPct) },
          ].map((c, i) => (
            <div key={i} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{c.icon}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{c.title}</div>
              <div style={{ fontSize: '15px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: c.color }}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly checklist */}
      <div className="glass" style={{ padding: '18px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Weekly Investor Checklist</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>Tap to mark done</div>
        {checklist.map((item, i) => (
          <div key={i} onClick={() => setChecked(c => ({ ...c, [i]: !c[i] }))}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', background: checked[i] ? 'rgba(16,185,129,0.08)' : 'transparent', border: `1px solid ${checked[i] ? 'rgba(16,185,129,0.2)' : 'transparent'}`, transition: 'all 0.2s' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${checked[i] ? 'var(--green2)' : 'var(--border2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: checked[i] ? 'var(--green2)' : 'transparent', fontSize: '11px', color: '#fff' }}>
              {checked[i] ? '✓' : ''}
            </div>
            <span style={{ fontSize: '13px', color: checked[i] ? 'var(--text3)' : 'var(--text)', textDecoration: checked[i] ? 'line-through' : 'none' }}>{item}</span>
          </div>
        ))}
        <div style={{ marginTop: '12px', padding: '10px', background: 'var(--bg3)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>
          {Object.values(checked).filter(Boolean).length} / {checklist.length} done
          {Object.values(checked).filter(Boolean).length === checklist.length && ' 🎉 All done!'}
        </div>
      </div>
    </div>
  );
}

// ─── Snapshot History View ────────────────────────────────────────────────────

export function SnapshotView() {
  const { portfolioId, saveSnapshot } = usePortfolio();
  const { snapshots, loading, reload } = useSnapshots(portfolioId, 30);
  const [saving, setSaving] = useState(false);

  async function handleSaveSnapshot() {
    setSaving(true);
    await saveSnapshot();
    await reload();
    setSaving(false);
  }

  return (
    <div className="fade-up">
      <div className="glass" style={{ padding: '18px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Portfolio Snapshots</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
            Save a snapshot of today's portfolio value to track progress over time.
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSaveSnapshot} disabled={saving} style={{ whiteSpace: 'nowrap' }}>
          {saving ? 'Saving…' : '📸 Save Snapshot Now'}
        </button>
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Snapshot History</span>
          <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text3)' }}>{snapshots.length} saved</span>
        </div>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>Loading…</div>
        ) : snapshots.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
            <div style={{ fontSize: '13px' }}>No snapshots yet. Click "Save Snapshot Now" to record your first checkpoint.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Portfolio Value</th>
                <th>Invested</th>
                <th>Realized</th>
                <th>Gain</th>
                <th>Return %</th>
                <th>MF CAGR</th>
                <th>Funds</th>
                <th>Stocks</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    {new Date(s.snapshotAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700' }}>{fmtCr(parseFloat(s.totalValue))}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{fmtCr(parseFloat(s.totalInvested))}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: colorPnl(parseFloat(s.totalRealizedGain)), fontWeight: '600' }}>{s.totalRealizedGain != null ? fmtCr(parseFloat(s.totalRealizedGain)) : '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: colorPnl(parseFloat(s.totalGain)), fontWeight: '600' }}>{fmtCr(parseFloat(s.totalGain))}</td>
                  <td><span className={parseFloat(s.totalReturnPct) >= 0 ? 'chip chip-green' : 'chip chip-red'}>{fmtPct(parseFloat(s.totalReturnPct), true)}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.mfCagr ? fmtPct(parseFloat(s.mfCagr)) : '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{s.fundCount ?? '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{s.stockCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
