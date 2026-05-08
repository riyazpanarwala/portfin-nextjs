'use client';

export { TradeForm } from '@/components/views/TradeForm';

import { useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { useSnapshots } from '@/hooks/useSnapshots';
import { fmtCr, fmt, fmtPct, colorPnl } from '@/lib/store';
import { CumChart, WaterfallChart } from '@/components/charts/Charts';
import { EmptyState, Alert } from '@/components/ui/SharedUI';
import styles from './OtherViews.module.css';

// ── TimelineView ──────────────────────────────────────────────────────────────

export function TimelineView() {
  const { trades, monthlyFlow, setActiveView } = usePortfolio();

  const byMonth = {};
  [...trades]
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
    .forEach(t => {
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

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className={`fade-up ${styles.timelineWrapper}`}>

      <div className={`glass ${styles.chartPanel}`}>
        <div className={styles.panelTitle}>Cumulative Invested Over Time</div>
        <CumChart data={cumFlow} />
      </div>

      <div className={`glass ${styles.chartPanel}`}>
        <div className={styles.panelTitle}>Monthly Investment Heatmap</div>
        <MonthlyHeatmap data={monthlyFlow} />
      </div>

      <div className={`glass ${styles.tradeHistoryPanel}`}>
        <div className={styles.tradeHistoryHeader}>
          <span className={styles.tradeHistoryTitle}>Trade History</span>
          <span className={styles.tradeHistoryCount}>· {trades.length} total trades</span>
        </div>
        {Object.entries(byMonth)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, ts]) => (
            <div key={month}>
              <div className={styles.monthGroupLabel}>
                {new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                <span className={styles.monthGroupCount}>· {ts.length} trade{ts.length > 1 ? 's' : ''}</span>
              </div>
              {ts.map((t, i) => (
                <div key={i} className={styles.tradeRow}>
                  <div className={styles.tradeRowLeft}>
                    <span className={`chip ${t.tradeType === 'BUY' ? 'chip-green' : 'chip-red'}`}>{t.tradeType}</span>
                    <span className={`chip ${t.assetType === 'MF' ? 'chip-blue' : 'chip-purple'}`}>{t.assetType}</span>
                    <div>
                      <div className={styles.tradeSymbol}>{t.symbol}</div>
                      <div className={styles.tradeMeta}>{t.tradeDate}{t.sector ? ` · ${t.sector}` : ''}</div>
                    </div>
                  </div>
                  <div className={styles.tradeRowRight}>
                    <div className={styles.tradeQtyPrice}>
                      {parseFloat(t.quantity)} units @ ₹{fmt(parseFloat(t.price))}
                    </div>
                    <div className={styles.tradeTotal}>
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
  if (!data || !data.length) return <div style={{ color: 'var(--text3)', fontSize: 12 }}>No data</div>;

  const max  = Math.max(...data.map(d => d.amount));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const byYear = {};
  data.forEach(d => {
    const [y, m] = d.month.split('-');
    if (!byYear[y]) byYear[y] = {};
    byYear[y][parseInt(m) - 1] = d.amount;
  });

  return (
    <div className={styles.heatmapScroll}>
      <div
        className={styles.heatmapGrid}
        style={{ gridTemplateColumns: '50px repeat(12, 1fr)' }}
      >
        {/* Header row */}
        <div />
        {MONTHS.map(m => (
          <div key={m} className={styles.heatmapMonthLabel}>{m}</div>
        ))}

        {/* Data rows */}
        {Object.entries(byYear).sort().map(([year, mdata]) => ([
          <div key={`${year}_l`} className={styles.heatmapYearLabel}>{year}</div>,
          ...MONTHS.map((_, mi) => {
            const val       = mdata[mi] || 0;
            const intensity = max > 0 ? val / max : 0;
            return (
              <div
                key={`${year}_${mi}`}
                title={val ? `₹${fmt(val, 0)}` : 'No investment'}
                className={styles.heatmapCell}
                style={{
                  background: val > 0
                    ? `rgba(59,130,246,${0.1 + intensity * 0.8})`
                    : 'var(--bg3)',
                }}
              />
            );
          }),
        ]))}
      </div>
    </div>
  );
}

// ── WaterfallView ─────────────────────────────────────────────────────────────

export function WaterfallView() {
  const { stats, holdings, setActiveView } = usePortfolio();

  if (!holdings.length) return (
    <EmptyState
      icon="💧"
      label="No holdings yet"
      sub="Add trades to see your wealth waterfall."
      cta="+ Add Trade"
      onCta={() => setActiveView('trade')}
    />
  );

  const mfGain = stats.mfValue - stats.mfInvested;
  const stGain = stats.stValue - stats.stInvested;

  const steps = [
    { label: 'MF Invested',    value: stats.mfInvested, color: 'var(--teal)',                                     pct: stats.totalValue > 0 ? stats.mfInvested / stats.totalValue * 100 : 0 },
    { label: 'Stock Invested', value: stats.stInvested, color: 'var(--purple)',                                    pct: stats.totalValue > 0 ? stats.stInvested / stats.totalValue * 100 : 0 },
    { label: 'MF Gains',       value: mfGain,           color: mfGain >= 0 ? 'var(--green2)' : 'var(--red2)',     pct: stats.totalValue > 0 ? mfGain / stats.totalValue * 100 : 0 },
    { label: 'Stock Gains',    value: stGain,           color: stGain >= 0 ? 'var(--green2)' : 'var(--red2)',     pct: stats.totalValue > 0 ? stGain / stats.totalValue * 100 : 0 },
    { label: 'Total Portfolio',value: stats.totalValue, color: 'var(--accent2)', isTotal: true },
  ];

  return (
    <div className={`fade-up ${styles.waterfallWrapper}`}>
      <div className={`glass ${styles.waterfallChartPanel}`}>
        <div className={styles.waterfallTitle}>Wealth Waterfall</div>
        <div className={styles.waterfallSub}>How your capital transformed into current portfolio value</div>
        <WaterfallChart steps={steps} />
      </div>

      <div className={`glass ${styles.waterfallBreakdownPanel}`}>
        <div className={styles.waterfallBreakdownHeader}>
          <span className={styles.waterfallBreakdownTitle}>Waterfall Breakdown</span>
        </div>
        <table>
          <thead>
            <tr><th>Component</th><th>Amount</th><th>% of Total</th></tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={i}>
                <td>
                  <div className={styles.colorDotCell}>
                    <div className={styles.colorDot} style={{ background: s.color }} />
                    {s.label}
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: s.color }}>{fmtCr(s.value)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                  {s.isTotal ? '100%' : (s.pct ? fmt(s.pct, 1) + '%' : '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ActionView ────────────────────────────────────────────────────────────────

export function ActionView() {
  const { stats, holdings, setActiveView } = usePortfolio();
  const [checked, setChecked] = useState({});

  if (!holdings.length) return (
    <EmptyState
      icon="⚡"
      label="No holdings yet"
      sub="Add trades to see your action signals."
      cta="+ Add Trade"
      onCta={() => setActiveView('trade')}
    />
  );

  const topGainer = [...holdings].sort((a, b) => b.returnPct - a.returnPct)[0];
  const topLoser  = [...holdings].sort((a, b) => a.returnPct - b.returnPct)[0];

  const pulseCards = [
    { icon: '📈', title: 'Top Gainer',      body: topGainer ? `${topGainer.symbol} ${fmtPct(topGainer.returnPct, true)}` : '—', color: 'var(--green2)'  },
    { icon: '📉', title: 'Underperformer',  body: topLoser  ? `${topLoser.symbol} ${fmtPct(topLoser.returnPct, true)}`   : '—', color: 'var(--red2)'    },
    { icon: '💰', title: 'Portfolio Value', body: fmtCr(stats.totalValue),                                                       color: 'var(--accent2)' },
    { icon: '📊', title: 'Overall Return',  body: fmtPct(stats.totalReturnPct, true),                                            color: colorPnl(stats.totalReturnPct) },
  ];

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

  const doneCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className={`fade-up ${styles.actionWrapper}`}>

      {/* Signal banner */}
      <div className={`glass ${styles.signalBanner}`}>
        <div className={styles.signalBannerLabel}>⚡ Today's Signal</div>
        <div className={styles.signalBannerTitle}>
          {stats.totalReturnPct >= 0
            ? 'Portfolio is in profit — stay the course'
            : 'Portfolio is in loss — review allocation'}
        </div>
        <div className={styles.signalBannerSub}>
          {stats.fundCount + stats.stockCount} holdings · Overall return {fmtPct(stats.totalReturnPct, true)} · CAGR {fmtPct(stats.overallCagr, true)}
        </div>
      </div>

      {/* Pulse cards */}
      <div className={`glass ${styles.pulsePanel}`}>
        <div className={styles.pulsePanelTitle}>Portfolio Pulse</div>
        <div className={styles.pulseGrid}>
          {pulseCards.map((c, i) => (
            <div key={i} className={styles.pulseCard}>
              <div className={styles.pulseCardIcon}>{c.icon}</div>
              <div className={styles.pulseCardLabel}>{c.title}</div>
              <div className={styles.pulseCardValue} style={{ color: c.color }}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Checklist */}
      <div className={`glass ${styles.checklistPanel}`}>
        <div className={styles.checklistTitle}>Weekly Investor Checklist</div>
        <div className={styles.checklistSub}>Tap to mark done</div>
        {checklist.map((item, i) => (
          <div
            key={i}
            onClick={() => setChecked(c => ({ ...c, [i]: !c[i] }))}
            className={`${styles.checklistItem} ${checked[i] ? styles.checklistItemChecked : ''}`}
          >
            <div
              className={styles.checklistBox}
              style={{
                border:     `2px solid ${checked[i] ? 'var(--green2)' : 'var(--border2)'}`,
                background:  checked[i] ? 'var(--green2)' : 'transparent',
              }}
            >
              {checked[i] ? '✓' : ''}
            </div>
            <span className={`${styles.checklistText} ${checked[i] ? styles.checklistTextDone : ''}`}>
              {item}
            </span>
          </div>
        ))}
        <div className={styles.checklistSummary}>
          {doneCount} / {checklist.length} done
          {doneCount === checklist.length && ' 🎉 All done!'}
        </div>
      </div>
    </div>
  );
}

// ── SnapshotView ──────────────────────────────────────────────────────────────

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
    <div className={`fade-up ${styles.snapshotWrapper}`}>

      <div className={`glass ${styles.snapshotHeaderPanel}`}>
        <div className={styles.snapshotHeaderLeft}>
          <div className={styles.snapshotHeaderTitle}>Portfolio Snapshots</div>
          <div className={styles.snapshotHeaderSub}>
            Save a snapshot of today's portfolio value to track progress over time.
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSaveSnapshot}
          disabled={saving}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? 'Saving…' : '📸 Save Snapshot Now'}
        </button>
      </div>

      <div className={`glass ${styles.snapshotTablePanel}`}>
        <div className={styles.snapshotTableHeader}>
          <span className={styles.snapshotTableTitle}>Snapshot History</span>
          <span className={styles.snapshotTableCount}>{snapshots.length} saved</span>
        </div>

        {loading ? (
          <div className={styles.snapshotLoading}>Loading…</div>
        ) : snapshots.length === 0 ? (
          <div className={styles.snapshotEmpty}>
            <div className={styles.snapshotEmptyIcon}>📸</div>
            <div className={styles.snapshotEmptyText}>
              No snapshots yet. Click "Save Snapshot Now" to record your first checkpoint.
            </div>
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
              {snapshots.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {new Date(s.snapshotAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtCr(parseFloat(s.totalValue))}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{fmtCr(parseFloat(s.totalInvested))}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: colorPnl(parseFloat(s.totalRealizedGain)), fontWeight: 600 }}>
                    {s.totalRealizedGain != null ? fmtCr(parseFloat(s.totalRealizedGain)) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: colorPnl(parseFloat(s.totalGain)), fontWeight: 600 }}>
                    {fmtCr(parseFloat(s.totalGain))}
                  </td>
                  <td>
                    <span className={parseFloat(s.totalReturnPct) >= 0 ? 'chip chip-green' : 'chip chip-red'}>
                      {fmtPct(parseFloat(s.totalReturnPct), true)}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>
                    {s.mfCagr ? fmtPct(parseFloat(s.mfCagr)) : '—'}
                  </td>
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
