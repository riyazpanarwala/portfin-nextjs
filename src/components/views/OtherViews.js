'use client';
export { TradeForm } from '@/components/views/TradeForm';

import { useState, useEffect } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { fmtCr, fmt, fmtPct, colorPnl, sectorColor, buildMonthlyFlow } from '@/lib/store';

// ─── Timeline View ────────────────────────────────────────────────────────────

export function TimelineView() {
  const { trades, monthlyFlow } = usePortfolio();

  const byMonth = {};
  [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).forEach(t => {
    const key = t.tradeDate.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(t);
  });

  const cumFlow = [];
  let cum = 0;
  monthlyFlow.forEach(m => { cum += m.amount; cumFlow.push({ ...m, cum }); });

  if (!trades.length) {
    return <EmptySection icon="📅" msg="No trades recorded yet. Add trades to see your investment timeline." />;
  }

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
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.tradeDate} {t.sector ? `· ${t.sector}` : ''}</div>
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

function CumChart({ data }) {
  if (!data || data.length < 2) return <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Not enough data</div>;
  const w = 600, h = 120, pad = 24;
  const max = Math.max(...data.map(d => d.cum));
  function toY(v) { return pad + ((max - v) / (max || 1)) * (h - pad * 2); }
  function toX(i) { return pad + (i / (data.length - 1)) * (w - pad * 2); }
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.cum)}`).join(' ');
  const area = line + ` L ${toX(data.length - 1)} ${h - pad} L ${toX(0)} ${h - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#cumGrad)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      {data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 8)) === 0).map((d, i) => (
        <text key={i} x={toX(data.indexOf(d))} y={h - 4} textAnchor="middle" fill="var(--text3)" fontSize="8">{d.month}</text>
      ))}
    </svg>
  );
}

function MonthlyHeatmap({ data }) {
  if (!data || !data.length) return <div style={{ color: 'var(--text3)', fontSize: '12px' }}>No data</div>;
  const max = Math.max(...data.map(d => d.amount));
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
  const { stats, holdings } = usePortfolio();

  if (!holdings.length) return <EmptySection icon="💧" msg="Add trades to see your wealth waterfall." />;

  const mfGain = stats.mfValue - stats.mfInvested;
  const stGain = stats.stValue - stats.stInvested;

  const steps = [
    { label: 'MF Invested',   value: stats.mfInvested, color: 'var(--teal)',   pct: stats.totalValue > 0 ? stats.mfInvested / stats.totalValue * 100 : 0 },
    { label: 'Stock Invested',value: stats.stInvested, color: 'var(--purple)', pct: stats.totalValue > 0 ? stats.stInvested / stats.totalValue * 100 : 0 },
    { label: 'MF Gains',      value: mfGain,           color: mfGain >= 0 ? 'var(--green2)' : 'var(--red2)', pct: stats.totalValue > 0 ? mfGain / stats.totalValue * 100 : 0 },
    { label: 'Stock Gains',   value: stGain,            color: stGain >= 0 ? 'var(--green2)' : 'var(--red2)', pct: stats.totalValue > 0 ? stGain / stats.totalValue * 100 : 0 },
    { label: 'Total Portfolio',value: stats.totalValue, color: 'var(--accent2)', isTotal: true },
  ];

  return (
    <div className="fade-up">
      <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>Wealth Waterfall</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '18px' }}>
          How your capital transformed into current portfolio value
        </div>
        <WaterfallSVG steps={steps} total={stats.totalValue} />
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

function WaterfallSVG({ steps, total }) {
  const w = 600, h = 200, pad = 40;
  const cols = steps.length;
  const colW = (w - pad * 2) / cols;
  const maxVal = total || 1;
  let runningTop = 0;

  const bars = steps.map((s, i) => {
    const absVal = Math.abs(s.value);
    const barH = Math.max(4, (absVal / maxVal) * (h - pad * 2));
    let y;
    if (s.isTotal) {
      runningTop = 0;
      y = (h - pad) - (total / maxVal) * (h - pad * 2);
    } else {
      if (s.value >= 0) {
        y = (h - pad) - runningTop - barH;
        runningTop += barH;
      } else {
        y = (h - pad) - runningTop;
        runningTop -= barH;
      }
    }
    return { ...s, barH, y, x: pad + i * colW + 4, w: colW - 8 };
  });

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      {bars.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.barH} rx="3" fill={b.color} opacity="0.85" />
          <text x={b.x + b.w / 2} y={h - 4} textAnchor="middle" fill="var(--text3)" fontSize="9">{b.label.split(' ')[0]}</text>
          <text x={b.x + b.w / 2} y={b.y - 5} textAnchor="middle" fill={b.color} fontSize="9" fontWeight="600">{fmtCr(b.value)}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Add Trade Form ───────────────────────────────────────────────────────────

// TradeForm moved to TradeForm.js
export function TradeForm_DISABLED() {
  const { addTrade, deleteTrade, trades, portfolioId } = usePortfolio();
  const [form, setForm] = useState({
    symbol: '', assetType: 'STOCK', tradeType: 'BUY',
    quantity: '', price: '', tradeDate: new Date().toISOString().slice(0, 10),
    sector: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit() {
    if (!form.symbol || !form.quantity || !form.price || !form.tradeDate) return;
    setSubmitting(true);
    await addTrade({ ...form, quantity: parseFloat(form.quantity), price: parseFloat(form.price) });
    setSubmitting(false);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setForm(f => ({ ...f, symbol: '', quantity: '', price: '', sector: '' }));
    }, 1800);
  }

  async function handleDelete(id) {
    setDeleteId(id);
    await deleteTrade(id);
    setDeleteId(null);
  }

  const recentTrades = [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).slice(0, 10);
  const txValue = form.quantity && form.price ? parseFloat(form.quantity) * parseFloat(form.price) : null;

  return (
    <div className="fade-up">
      <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Form */}
        <div className="glass" style={{ padding: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>Record Trade</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '20px' }}>
            Add a buy or sell transaction to your portfolio database.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <FormField label="Asset Type">
              <select value={form.assetType} onChange={e => set('assetType', e.target.value)}>
                <option value="STOCK">Equity Stock</option>
                <option value="MF">Mutual Fund</option>
              </select>
            </FormField>
            <FormField label="Trade Type">
              <select value={form.tradeType} onChange={e => set('tradeType', e.target.value)}>
                <option value="BUY">Buy</option>
                <option value="SELL">Sell</option>
              </select>
            </FormField>
          </div>

          <FormField label="Symbol / Fund Name">
            <input value={form.symbol} onChange={e => set('symbol', e.target.value.toUpperCase())}
              placeholder={form.assetType === 'MF' ? 'e.g. HDFC TOP 100 FUND' : 'e.g. INFY'} />
          </FormField>

          <FormField label="Sector / Category (optional)">
            <input value={form.sector} onChange={e => set('sector', e.target.value)}
              placeholder={form.assetType === 'MF' ? 'e.g. Large Cap, ELSS' : 'e.g. IT, Banking'} />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Quantity / Units">
              <input type="number" min="0" step="any" value={form.quantity}
                onChange={e => set('quantity', e.target.value)} placeholder="100" />
            </FormField>
            <FormField label={form.assetType === 'MF' ? 'NAV (₹)' : 'Price (₹)'}>
              <input type="number" min="0" step="any" value={form.price}
                onChange={e => set('price', e.target.value)} placeholder="1500.00" />
            </FormField>
          </div>

          <FormField label="Trade Date">
            <input type="date" value={form.tradeDate} onChange={e => set('tradeDate', e.target.value)} />
          </FormField>

          {txValue != null && (
            <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Transaction value</span>
              <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>{fmtCr(txValue)}</span>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !form.symbol || !form.quantity || !form.price}
            style={{ width: '100%', justifyContent: 'center', padding: '11px', opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Saving…' : success ? '✅ Saved!' : `${form.tradeType === 'BUY' ? '📈 Buy' : '📉 Sell'} — Record Trade`}
          </button>
        </div>

        {/* Recent trades */}
        <div className="glass" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Recent Trades</span>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{trades.length} total</span>
          </div>
          {recentTrades.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>No trades yet</div>
          ) : (
            recentTrades.map((t, i) => (
              <div key={t.id} style={{ padding: '10px 18px', borderBottom: '1px solid rgba(45,64,96,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`chip ${t.tradeType === 'BUY' ? 'chip-green' : 'chip-red'}`}>{t.tradeType}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{t.symbol}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      {t.tradeDate} · {parseFloat(t.quantity)} × ₹{fmt(parseFloat(t.price), 1)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text2)' }}>
                    {fmtCr(parseFloat(t.quantity) * parseFloat(t.price))}
                  </div>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deleteId === t.id}
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red2)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', opacity: deleteId === t.id ? 0.5 : 1 }}
                  >
                    {deleteId === t.id ? '…' : '✕'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Action Signal View ───────────────────────────────────────────────────────

export function ActionView() {
  const { stats, holdings } = usePortfolio();
  const [checked, setChecked] = useState({});

  if (!holdings.length) return <EmptySection icon="⚡" msg="Add trades to see your action signals." />;

  const topGainer = [...holdings].sort((a, b) => b.returnPct - a.returnPct)[0];
  const topLoser  = [...holdings].sort((a, b) => a.returnPct - b.returnPct)[0];

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
      <div className="glass" style={{ padding: '20px', marginBottom: '16px', background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.05))', border: '1px solid rgba(59,130,246,0.3)' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent2)', marginBottom: '8px' }}>⚡ Today's Signal</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '6px' }}>
          {stats.totalReturnPct >= 0 ? 'Portfolio is in profit — stay the course' : 'Portfolio is in loss — review allocation'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
          {stats.fundCount + stats.stockCount} holdings · Overall return {fmtPct(stats.totalReturnPct, true)} · CAGR {fmtPct(stats.overallCagr, true)}
        </div>
      </div>

      <div className="glass" style={{ padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Portfolio Pulse</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {[
            { icon: '📈', title: 'Top Gainer',      body: topGainer ? `${topGainer.symbol} ${fmtPct(topGainer.returnPct, true)}` : '—', color: 'var(--green2)' },
            { icon: '📉', title: 'Underperformer',  body: topLoser  ? `${topLoser.symbol} ${fmtPct(topLoser.returnPct, true)}`  : '—', color: 'var(--red2)' },
            { icon: '💰', title: 'Portfolio Value',  body: fmtCr(stats.totalValue), color: 'var(--accent2)' },
            { icon: '📊', title: 'Overall Return',   body: fmtPct(stats.totalReturnPct, true), color: colorPnl(stats.totalReturnPct) },
          ].map((c, i) => (
            <div key={i} style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{c.icon}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{c.title}</div>
              <div style={{ fontSize: '15px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: c.color }}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>

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

// ─── Snapshot History View — loads from DB ───────────────────────────────────

export function SnapshotView() {
  const { portfolioId, stats, saveSnapshot } = usePortfolio();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!portfolioId) return;
    setLoading(true);
    fetch(`/api/snapshots?portfolioId=${portfolioId}&limit=30`)
      .then(r => r.json())
      .then(d => setSnapshots(d.snapshots || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portfolioId]);

  async function handleSaveSnapshot() {
    setSaving(true);
    await saveSnapshot();
    // Refresh list
    const r = await fetch(`/api/snapshots?portfolioId=${portfolioId}&limit=30`);
    const d = await r.json();
    setSnapshots(d.snapshots || []);
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
                <th>Gain</th>
                <th>Return %</th>
                <th>MF CAGR</th>
                <th>Funds</th>
                <th>Stocks</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, i) => {
                const prev = snapshots[i + 1];
                const change = prev ? ((parseFloat(s.totalValue) - parseFloat(prev.totalValue)) / parseFloat(prev.totalValue) * 100) : null;
                return (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      {new Date(s.snapshotAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700' }}>{fmtCr(parseFloat(s.totalValue))}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{fmtCr(parseFloat(s.totalInvested))}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: colorPnl(parseFloat(s.totalGain)), fontWeight: '600' }}>{fmtCr(parseFloat(s.totalGain))}</td>
                    <td><span className={parseFloat(s.totalReturnPct) >= 0 ? 'chip chip-green' : 'chip chip-red'}>{fmtPct(parseFloat(s.totalReturnPct), true)}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{s.mfCagr ? fmtPct(parseFloat(s.mfCagr)) : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{s.fundCount ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{s.stockCount ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Shared empty state ───────────────────────────────────────────────────────

function EmptySection({ icon, msg }) {
  const { setActiveView } = usePortfolio();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '12px' }}>
      <div style={{ fontSize: '40px' }}>{icon}</div>
      <div style={{ fontSize: '14px', color: 'var(--text2)', textAlign: 'center', maxWidth: '340px' }}>{msg}</div>
      <button className="btn btn-primary" onClick={() => setActiveView('trade')}>+ Add Trade</button>
    </div>
  );
}
