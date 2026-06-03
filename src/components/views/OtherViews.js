'use client';

export { TradeForm } from '@/components/views/TradeForm';

import { useMemo, useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { useSnapshots } from '@/hooks/useSnapshots';
import { fmtCr, fmt, fmtPct, colorPnl } from '@/lib/store';
import { EmptyState, Alert } from '@/components/ui/SharedUI';
import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from './OtherViews.module.css';

// ── TimelineView ──────────────────────────────────────────────────────────────

export function TimelineView() {
  const { trades, monthlyFlow, holdings, stats, setActiveView } = usePortfolio();
  const [selectedYear, setSelectedYear] = useState('all');

  const timeline = useMemo(
    () => buildTimelineModel(holdings, stats, monthlyFlow),
    [holdings, stats, monthlyFlow],
  );
  const activeYear = selectedYear === 'all' ? timeline.latestYear : selectedYear;
  const heatmapRows = selectedYear === 'all'
    ? timeline.heatmapRows
    : timeline.heatmapRows.filter(row => row.year === activeYear);
  const yearlyRows = selectedYear === 'all'
    ? timeline.yearlyTotals
    : timeline.yearlyTotals.filter(row => row.year === activeYear);
  const cumulativeSeries = selectedYear === 'all'
    ? timeline.cumulativeSeries
    : timeline.cumulativeSeries.filter(row => row.month.startsWith(`${activeYear}-`));
  const maxMonthAmount = Math.max(...heatmapRows.flatMap(row => row.months.map(month => month.amount)), 1);
  const maxYearAmount = Math.max(...yearlyRows.map(row => row.amount), 1);
  const monthlyRows = timeline.byYear[activeYear]?.months ?? [];

  if (!trades.length) return (
    <EmptyState
      icon="TL"
      label="No trades recorded yet"
      sub="Add trades to see your investment timeline."
      cta="+ Add Trade"
      onCta={() => setActiveView('trade')}
    />
  );

  return (
    <div className={`fade-up ${styles.timelineWrapper}`}>
      <div className={styles.timelineHero}>
        <div>
          <div className={styles.timelineHeroTitle}>Investment Timeline</div>
          <div className={styles.timelineHeroMeta}>
            {stats.fundCount} mutual funds · {stats.stockCount} equity stocks · Since {timeline.sinceLabel}
          </div>
        </div>
        <div className={styles.timelineReturnPills}>
          <span className={styles.returnPill}>MF {fmtPct(stats.mfCagr)}</span>
          <span className={styles.returnPill}>Stocks {fmtPct(stats.stCagr)}</span>
          <span className={`${styles.returnPill} ${styles.returnPillGold}`}>Combined {fmtPct(stats.overallCagr)}</span>
        </div>
      </div>

      <div className={styles.timelineMetricGrid}>
        {timeline.metricCards.map(card => (
          <TimelineMetricCard key={card.label} {...card} />
        ))}
      </div>

      <YearTabs years={timeline.years} selected={selectedYear} onSelect={setSelectedYear} />

      <section className={`glass ${styles.timelinePanel} ${styles.heatmapPanel}`}>
        <PanelHeading title="Monthly investment heatmap">
          <div className={styles.heatmapLegend}>
            <span>Less</span>
            {[0, 1, 2, 3, 4].map(i => <span key={i} className={`${styles.legendSquare} ${styles[`legendSquare${i}`]}`} />)}
            <span>More</span>
          </div>
        </PanelHeading>
        <MonthlyHeatmap data={heatmapRows} max={maxMonthAmount} />
      </section>

      <div className={styles.timelineTwoCol}>
        <section className={`glass ${styles.timelinePanel}`}>
          <PanelHeading title="Yearly investment totals" />
          <YearlyTotals rows={yearlyRows} max={maxYearAmount} />
        </section>

        <section className={`glass ${styles.timelinePanel}`}>
          <PanelHeading title="Monthly breakdown">
            <YearTabs years={timeline.years} selected={activeYear} onSelect={setSelectedYear} compact />
          </PanelHeading>
          <MonthlyBreakdown rows={monthlyRows} total={timeline.byYear[activeYear]?.amount ?? 0} year={activeYear} />
        </section>
      </div>

      <section className={`glass ${styles.timelinePanel}`}>
        <PanelHeading title="Cumulative invested over time (MF + Stocks)" />
        <TimelineCumulativeChart data={cumulativeSeries} />
      </section>

      <div className={styles.timelineMetricGrid}>
        {timeline.footerCards.map(card => (
          <TimelineMetricCard key={card.label} {...card} compact />
        ))}
      </div>
    </div>
  );
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TIMELINE_TICK = { fill: '#5c7a9a', fontSize: 10, fontFamily: 'var(--font-mono)' };
const TIMELINE_GRID = 'rgba(45,64,96,0.45)';

function buildTimelineModel(holdings, stats, monthlyFlow) {
  const activeLots = holdings.flatMap(holding =>
    (holding.lots ?? []).map(lot => ({
      date: lot.date,
      assetType: holding.assetType,
      amount: parseFloat(lot.qty || 0) * parseFloat(lot.price || 0),
    }))
  ).filter(lot => lot.date && lot.amount > 0);
  const years = [...new Set(activeLots.map(lot => lot.date.slice(0, 4)).filter(Boolean))].sort();
  const latestYear = years[years.length - 1] ?? String(new Date().getFullYear());
  const firstTradeDate = activeLots.reduce((min, lot) => {
    const date = (lot.date || '').slice(0, 10);
    return date && (!min || date < min) ? date : min;
  }, '');

  const byYear = {};
  const assetMonthly = {};
  activeLots.forEach(lot => {
    const month = (lot.date || '').slice(0, 7);
    const year = month.slice(0, 4);
    const monthIndex = Number(month.slice(5, 7)) - 1;
    const amount = lot.amount;
    if (!month || Number.isNaN(monthIndex)) return;
    if (!byYear[year]) {
      byYear[year] = {
        amount: 0,
        months: MONTHS_SHORT.map((label, i) => ({ label, month: `${year}-${String(i + 1).padStart(2, '0')}`, amount: 0 })),
      };
    }
    byYear[year].amount += amount;
    byYear[year].months[monthIndex].amount += amount;

    if (!assetMonthly[month]) assetMonthly[month] = { month, mf: 0, stocks: 0 };
    if (lot.assetType === 'MF') assetMonthly[month].mf += amount;
    else assetMonthly[month].stocks += amount;
  });

  years.forEach(year => {
    if (!byYear[year]) {
      byYear[year] = {
        amount: 0,
        months: MONTHS_SHORT.map((label, i) => ({ label, month: `${year}-${String(i + 1).padStart(2, '0')}`, amount: 0 })),
      };
    }
    const yearTotal = byYear[year].amount || 1;
    byYear[year].months = byYear[year].months.map(m => ({ ...m, pct: m.amount > 0 ? (m.amount / yearTotal) * 100 : 0 }));
  });

  const heatmapRows = years.map(year => ({
    year,
    months: MONTHS_SHORT.map((label, i) => {
      const month = `${year}-${String(i + 1).padStart(2, '0')}`;
      const amount = byYear[year]?.months[i]?.amount ?? 0;
      return { label, month, amount };
    }),
  }));

  const yearlyTotals = years.map(year => ({ year, amount: byYear[year]?.amount ?? 0 }));
  const cumulativeSeries = Object.values(assetMonthly).sort((a, b) => a.month.localeCompare(b.month));
  let cumMf = 0, cumStocks = 0;
  const cumulative = cumulativeSeries.map(row => {
    cumMf += row.mf;
    cumStocks += row.stocks;
    return { month: row.month, mf: cumMf, stocks: cumStocks, total: cumMf + cumStocks };
  });

  const activeMonthlyRows = Object.values(assetMonthly)
    .map(row => ({ month: row.month, amount: row.mf + row.stocks }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const buyingMonths = monthlyFlow.filter(m => m.amount > 0);
  const positiveMonths = activeMonthlyRows.filter(m => m.amount > 0);
  const bestMonth = activeMonthlyRows.reduce((best, row) => row.amount > (best?.amount ?? -1) ? row : best, null);
  const activeMonths = buyingMonths.length;
  const maxMonthAmount = Math.max(...activeMonthlyRows.map(m => m.amount), 1);
  const maxYearAmount = Math.max(...yearlyTotals.map(y => y.amount), 1);
  const activeMfInvested = stats?.mfInvested ?? 0;
  const activeStockInvested = stats?.stInvested ?? 0;
  const activeTotalInvested = stats?.totalInvested ?? activeMfInvested + activeStockInvested;
  const avgMonthly = activeMonths > 0 ? activeTotalInvested / activeMonths : 0;
  const lowestMonth = positiveMonths.reduce((low, row) => row.amount < (low?.amount ?? Infinity) ? row : low, null);
  const highestYear = yearlyTotals.reduce((best, row) => row.amount > (best?.amount ?? -1) ? row : best, null);
  const inactiveMonths = countInactiveBuyingMonths(monthlyFlow);
  const totalLots = activeLots.length || holdings.reduce((sum, h) => sum + (h.lots?.length ?? 0), 0);

  return {
    years,
    latestYear,
    sinceLabel: firstTradeDate ? new Date(firstTradeDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-',
    byYear,
    heatmapRows,
    yearlyTotals,
    cumulativeSeries: cumulative,
    maxMonthAmount,
    maxYearAmount,
    metricCards: [
      { label: 'Total invested', value: fmtCr(activeTotalInvested), sub: 'Current active cost basis', color: 'gold' },
      { label: 'Avg monthly SIP', value: fmtCr(avgMonthly), sub: 'Across active months', color: 'blue' },
      { label: 'Active months', value: fmt(activeMonths, 0), sub: formatYears(activeMonths), color: 'green' },
      { label: 'Total lots', value: fmt(totalLots, 0), sub: 'Individual purchases', color: 'purple' },
      { label: 'Best month', value: bestMonth ? fmtCr(bestMonth.amount) : '-', sub: bestMonth ? monthLabel(bestMonth.month) : 'No buys', color: 'gold' },
      { label: 'Lowest month', value: lowestMonth ? fmtCr(lowestMonth.amount) : '-', sub: lowestMonth ? monthLabel(lowestMonth.month) : 'No buys', color: 'slate' },
    ],
    footerCards: [
      { label: 'Longest SIP streak', value: `${longestMonthStreak(monthlyFlow)} months`, sub: 'Consecutive buying months', color: 'green' },
      { label: 'Highest-invest year', value: highestYear?.year ?? '-', sub: highestYear ? `${fmtCr(highestYear.amount)} deployed` : 'No yearly data', color: 'gold' },
      { label: 'Avg annual invest', value: fmtCr(years.length ? activeTotalInvested / years.length : 0), sub: `Across ${years.length || 0} active years`, color: 'blue' },
      { label: 'Inactive months', value: fmt(inactiveMonths, 0), sub: 'Calendar months with no buys', color: 'slate' },
      { label: 'MF vs stocks split', value: activeTotalInvested ? `${fmt((activeMfInvested / activeTotalInvested) * 100, 0)}% / ${fmt((activeStockInvested / activeTotalInvested) * 100, 0)}%` : '-', sub: 'Of current invested capital', color: 'purple' },
      { label: 'Biggest single month', value: bestMonth ? fmtCr(bestMonth.amount) : '-', sub: bestMonth ? monthLabel(bestMonth.month) : 'No buys', color: 'gold' },
    ],
  };
}

function monthLabel(month) {
  return new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function formatYears(months) {
  const years = Math.floor(months / 12);
  return years > 0 ? `Over ${years} yr${years > 1 ? 's' : ''}` : 'Under 1 yr';
}

function longestMonthStreak(monthlyFlow) {
  const active = new Set(monthlyFlow.filter(m => m.amount > 0).map(m => m.month));
  if (!active.size) return 0;
  const months = [...active].sort();
  let best = 1, current = 1;
  for (let i = 1; i < months.length; i++) {
    current = nextMonthKey(months[i - 1]) === months[i] ? current + 1 : 1;
    best = Math.max(best, current);
  }
  return best;
}

function countInactiveBuyingMonths(monthlyFlow) {
  const months = monthlyFlow.map(m => m.month).filter(Boolean).sort();
  if (!months.length) return 0;
  const active = new Set(monthlyFlow.filter(m => m.amount > 0).map(m => m.month));
  let inactive = 0;
  for (let cursor = months[0]; cursor <= months[months.length - 1]; cursor = nextMonthKey(cursor)) {
    if (!active.has(cursor)) inactive += 1;
  }
  return inactive;
}

function nextMonthKey(month) {
  const [year, mon] = month.split('-').map(Number);
  const next = new Date(year, mon, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function TimelineMetricCard({ label, value, sub, color, compact = false }) {
  return (
    <div className={`${styles.timelineMetricCard} ${styles[`timelineMetric${color}`]} ${compact ? styles.timelineMetricCompact : ''}`}>
      <div className={styles.timelineMetricLabel}>{label}</div>
      <div className={styles.timelineMetricValue}>{value}</div>
      <div className={styles.timelineMetricSub}>{sub}</div>
    </div>
  );
}

function PanelHeading({ title, children }) {
  return (
    <div className={styles.timelinePanelHeading}>
      <div className={styles.timelinePanelTitle}>{title}</div>
      {children}
    </div>
  );
}

function YearTabs({ years, selected, onSelect, compact = false }) {
  return (
    <div className={`${styles.yearTabs} ${compact ? styles.yearTabsCompact : ''}`}>
      {!compact && <span className={styles.yearTabsLabel}>Year:</span>}
      {!compact && (
        <button className={`${styles.yearTab} ${selected === 'all' ? styles.yearTabActive : ''}`} onClick={() => onSelect('all')}>
          All
        </button>
      )}
      {years.map(year => (
        <button key={year} className={`${styles.yearTab} ${selected === year ? styles.yearTabActive : ''}`} onClick={() => onSelect(year)}>
          {year}
        </button>
      ))}
    </div>
  );
}

function MonthlyHeatmap({ data, max }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || !data.length) return <div className={styles.chartEmpty}>No data</div>;

  function showTooltip(event, month, value) {
    const gridRect = event.currentTarget.closest(`.${styles.heatmapGrid}`).getBoundingClientRect();
    const cellRect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = 210;
    const tooltipHeight = 76;
    const gap = 12;
    const preferredLeft = cellRect.right - gridRect.left + gap;
    const left = preferredLeft + tooltipWidth > gridRect.width
      ? cellRect.left - gridRect.left - tooltipWidth - gap
      : preferredLeft;
    const top = Math.max(
      8 + tooltipHeight / 2,
      Math.min(
        cellRect.top - gridRect.top + cellRect.height / 2,
        gridRect.height - tooltipHeight / 2 - 8,
      ),
    );

    setTooltip({
      month: monthLabel(month.month),
      value,
      left: Math.max(8, left),
      top,
    });
  }

  return (
    <div className={styles.heatmapScroll}>
      <div className={styles.heatmapGrid} style={{ gridTemplateColumns: '50px repeat(12, 1fr)' }}>
        <div />
        {MONTHS_SHORT.map(month => <div key={month} className={styles.heatmapMonthLabel}>{month}</div>)}
        {data.map(row => ([
          <div key={`${row.year}_l`} className={styles.heatmapYearLabel}>{row.year}</div>,
          ...row.months.map(month => {
            const value = month.amount || 0;
            const intensity = max > 0 ? value / max : 0;
            return (
              <div
                key={month.month}
                className={styles.heatmapCell}
                style={{ background: heatmapColor(intensity, value) }}
                onMouseEnter={event => showTooltip(event, month, value)}
                onMouseMove={event => showTooltip(event, month, value)}
                onMouseLeave={() => setTooltip(null)}
                onFocus={event => showTooltip(event, month, value)}
                onBlur={() => setTooltip(null)}
                tabIndex={0}
                aria-label={`${monthLabel(month.month)} invested ${fmtCr(value)}`}
              />
            );
          }),
        ]))}
        {tooltip && (
          <div
            className={styles.heatmapTooltip}
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <div className={styles.heatmapTooltipMonth}>{tooltip.month}</div>
            <div className={styles.heatmapTooltipValue}>Invested: {fmtCr(tooltip.value)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function heatmapColor(intensity, value) {
  if (!value) return 'rgba(26,34,54,0.85)';
  if (intensity > 0.72) return '#d6a72f';
  if (intensity > 0.45) return '#bd9128';
  if (intensity > 0.22) return '#1f6f46';
  return '#173c2a';
}

function YearlyTotals({ rows, max }) {
  return (
    <div className={styles.yearlyTotals}>
      {rows.map(row => (
        <div key={row.year} className={styles.yearlyTotalRow}>
          <span className={styles.yearlyTotalYear}>{row.year}</span>
          <span className={styles.yearlyTotalTrack}>
            <span
              className={`${styles.yearlyTotalBar} ${row.amount > max * 0.7 ? styles.yearlyTotalBarGold : ''}`}
              style={{ width: `${Math.max(4, (row.amount / max) * 100)}%` }}
            />
          </span>
          <span className={styles.yearlyTotalValue}>{fmtCr(row.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function MonthlyBreakdown({ rows, total, year }) {
  const visibleRows = rows.filter(row => row.amount > 0);
  if (!visibleRows.length) return <div className={styles.chartEmpty}>No investments recorded for {year}.</div>;

  return (
    <div className={styles.monthlyBreakdown}>
      <table>
        <thead>
          <tr><th>Month</th><th>Invested</th><th>% of Year</th></tr>
        </thead>
        <tbody>
          {visibleRows.map(row => (
            <tr key={row.month}>
              <td>
                <div className={styles.monthNameCell}>
                  <span className={styles.monthLine} style={{ width: `${Math.max(18, row.pct)}px` }} />
                  {row.label}
                </div>
              </td>
              <td className={styles.moneyCell}>{fmtCr(row.amount)}</td>
              <td className={styles.percentCell}>{fmt(row.pct, 0)}%</td>
            </tr>
          ))}
          <tr>
            <td className={styles.totalRowLabel}>Total {year}</td>
            <td className={styles.totalRowValue}>{fmtCr(total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TimelineCumulativeChart({ data }) {
  if (!data || data.length < 2) return <div className={styles.chartEmpty}>Not enough data for a cumulative chart.</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
        <defs>
          <linearGradient id="timeline-total-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#d6a72f" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#d6a72f" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={TIMELINE_GRID} />
        <XAxis dataKey="month" tick={TIMELINE_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" angle={-45} height={54} textAnchor="end" />
        <YAxis tickFormatter={value => `Rs ${(value / 100000).toFixed(1)} L`} tick={TIMELINE_TICK} axisLine={false} tickLine={false} width={70} />
        <Tooltip content={<TimelineTooltip />} cursor={{ stroke: 'rgba(148,169,196,0.3)', strokeDasharray: '4 4' }} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#94a9c4' }} />
        <Area type="monotone" dataKey="total" stroke="#d6a72f" fill="url(#timeline-total-fill)" strokeWidth={2.5} dot={false} name="Total" />
        <Line type="monotone" dataKey="mf" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 4" dot={false} name="MF" />
        <Line type="monotone" dataKey="stocks" stroke="#f97316" strokeWidth={2} strokeDasharray="2 4" dot={false} name="Stocks" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = [
    { key: 'total', label: 'Total', color: '#d6a72f' },
    { key: 'mf', label: 'MF', color: '#60a5fa' },
    { key: 'stocks', label: 'Stocks', color: '#f97316' },
  ];
  const values = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));
  return (
    <div className={styles.timelineTooltip}>
      <div className={styles.timelineTooltipLabel}>{label}</div>
      {rows.map(row => (
        <div key={row.key} className={styles.timelineTooltipRow}>
          <span><i style={{ background: row.color }} />{row.label}</span>
          <strong>{fmtCr(values[row.key])}</strong>
        </div>
      ))}
    </div>
  );
}
// â”€â”€ WaterfallView â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function WaterfallView() {
  const { stats, holdings, setActiveView } = usePortfolio();

  if (!holdings.length) return (
    <EmptyState
      icon="ðŸ’§"
      label="No holdings yet"
      sub="Add trades to see your wealth waterfall."
      cta="+ Add Trade"
      onCta={() => setActiveView('trade')}
    />
  );

  const mfGain = stats.mfValue - stats.mfInvested;
  const stGain = stats.stValue - stats.stInvested;
  const totalCapital = stats.mfInvested + stats.stInvested;
  const totalGains = mfGain + stGain;
  const gainsVsCapital = totalCapital > 0 ? totalGains / totalCapital * 100 : 0;
  const wealthMultiplier = totalCapital > 0 ? stats.totalValue / totalCapital : 0;
  const marketReturnShare = stats.totalValue > 0 ? totalGains / stats.totalValue * 100 : 0;
  const capitalShare = Math.max(0, 100 - marketReturnShare);
  const mfReturnOnCapital = stats.mfInvested > 0 ? mfGain / stats.mfInvested * 100 : 0;
  const stReturnOnCapital = stats.stInvested > 0 ? stGain / stats.stInvested * 100 : 0;

  const steps = [
    { label: 'MF Invested', value: stats.mfInvested, color: '#60a5fa', pct: stats.totalValue > 0 ? stats.mfInvested / stats.totalValue * 100 : 0 },
    { label: 'Stocks Bought', value: stats.stInvested, color: '#a78bfa', pct: stats.totalValue > 0 ? stats.stInvested / stats.totalValue * 100 : 0 },
    { label: 'MF Gains', value: mfGain, color: mfGain >= 0 ? 'var(--green2)' : 'var(--red2)', pct: stats.totalValue > 0 ? mfGain / stats.totalValue * 100 : 0 },
    { label: 'Stock P&L', value: stGain, color: stGain >= 0 ? '#5fd66f' : 'var(--red2)', pct: stats.totalValue > 0 ? stGain / stats.totalValue * 100 : 0 },
    { label: 'Current Value', value: stats.totalValue, color: '#d6a72f', isTotal: true, pct: 100 },
  ];

  const runningSteps = [];
  let running = 0;
  const maxChartValue = Math.max(
    stats.totalValue,
    ...steps.filter(s => !s.isTotal).map(s => {
      const next = running + s.value;
      running = next;
      return Math.max(0, next);
    }),
    1
  );
  running = 0;
  steps.forEach(step => {
    if (step.isTotal) {
      runningSteps.push({ ...step, start: 0, end: step.value, height: Math.max(0, step.value) });
      return;
    }
    const start = running;
    const end = running + step.value;
    running = end;
    runningSteps.push({ ...step, start: Math.min(start, end), end: Math.max(start, end), height: Math.abs(step.value) });
  });

  const metricCards = [
    { label: 'Capital Deployed', value: fmtCr(totalCapital), sub: 'Total invested (MF + Stocks)', tone: styles.waterfallToneBlue },
    { label: 'Total Gains', value: fmtCr(totalGains), sub: fmtPct(gainsVsCapital, true), tone: styles.waterfallToneGreen },
    { label: 'Current Value', value: fmtCr(stats.totalValue), sub: 'Portfolio today', tone: styles.waterfallToneGold },
    { label: 'Wealth Multiplier', value: `${fmt(wealthMultiplier, 2)}x`, sub: `Rs 1 invested -> Rs ${fmt(wealthMultiplier, 2)}`, tone: styles.waterfallTonePurple },
    { label: 'Gains vs Capital', value: fmtPct(marketReturnShare, false), sub: 'Wealth from market returns', tone: styles.waterfallToneSlate },
  ];

  const contributionCards = [
    { label: 'MF Contribution', value: stats.totalValue > 0 ? stats.mfInvested / stats.totalValue * 100 : 0, color: '#60a5fa' },
    { label: 'Stock Contribution', value: stats.totalValue > 0 ? stats.stInvested / stats.totalValue * 100 : 0, color: '#a78bfa' },
    { label: 'MF Gains Contribution', value: stats.totalValue > 0 ? mfGain / stats.totalValue * 100 : 0, color: '#43d357' },
    { label: 'Stock Gain Contribution', value: stats.totalValue > 0 ? stGain / stats.totalValue * 100 : 0, color: stGain >= 0 ? '#5fd66f' : 'var(--red2)' },
  ];

  return (
    <div className={`fade-up ${styles.waterfallWrapper}`}>
      <div className={styles.waterfallHero}>
        <div>
          <p>{stats.fundCount} mutual funds · {stats.stockCount} equity stocks · Since Aug 2017</p>
        </div>
        <div className={styles.waterfallHeroBadges}>
          <span>MF {fmtPct(mfReturnOnCapital, true)}</span>
          <span>Stocks {fmtPct(stReturnOnCapital, true)}</span>
          <span className={styles.waterfallCombined}>Combined {fmtPct(gainsVsCapital, true)}</span>
        </div>
      </div>

      <div className={styles.waterfallMetricGrid}>
        {metricCards.map(card => (
          <div key={card.label} className={`glass ${styles.waterfallMetricCard} ${card.tone}`}>
            <div className={styles.waterfallMetricLabel}>{card.label}</div>
            <div className={styles.waterfallMetricValue}>{card.value}</div>
            <div className={styles.waterfallMetricSub}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.waterfallContributionGrid}>
        {contributionCards.map(card => (
          <div key={card.label} className={`glass ${styles.waterfallContributionCard}`}>
            <div className={styles.waterfallContributionLabel}>
              <span style={{ background: card.color }} />
              {card.label}
            </div>
            <div style={{ color: card.color }} className={styles.waterfallContributionValue}>
              {fmt(card.value, 0)}%
            </div>
          </div>
        ))}
      </div>

      <section className={`glass ${styles.waterfallChartPanel}`}>
        <div className={styles.waterfallPanelHeader}>
          <div className={styles.waterfallPanelTitle}>Wealth waterfall - where your money came from</div>
          <div className={styles.waterfallPanelSub}>Starting capital to SIPs added to MF gains to Stock gains to Current portfolio value</div>
        </div>
        <div className={styles.waterfallCanvas}>
          <div className={styles.waterfallYAxis}>
            {[1, 0.75, 0.5, 0.25, 0].map(mark => (
              <div key={mark}>{fmtCr(maxChartValue * mark)}</div>
            ))}
          </div>
          <div className={styles.waterfallPlot}>
            {[0.25, 0.5, 0.75, 1].map(line => (
              <span key={line} className={styles.waterfallGridLine} style={{ bottom: `${line * 100}%` }} />
            ))}
            {runningSteps.map(step => {
              const bottom = step.isTotal ? 0 : step.start / maxChartValue * 100;
              const height = Math.max(0.8, step.height / maxChartValue * 100);
              return (
                <div key={step.label} className={styles.waterfallBarSlot}>
                  <div
                    className={`${styles.waterfallBar} ${step.isTotal ? styles.waterfallBarTotal : ''}`}
                    style={{
                      '--bar-color': step.color,
                      bottom: `${Math.max(0, bottom)}%`,
                      height: `${height}%`,
                    }}
                  >
                    <span className={styles.waterfallBarValue}>{fmtCr(step.value)}</span>
                  </div>
                  <div className={styles.waterfallBarLabel}>{step.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className={styles.waterfallLowerGrid}>
      <div className={`glass ${styles.waterfallBreakdownPanel}`}>
        <div className={styles.waterfallBreakdownHeader}>
          <span className={styles.waterfallBreakdownTitle}>Waterfall breakdown</span>
        </div>
        <div className={styles.waterfallBreakdownRows}>
          {steps.map(s => (
            <div key={s.label} className={styles.waterfallBreakdownRow}>
              <div className={styles.colorDotCell}>
                <div className={styles.colorDot} style={{ background: s.color }} />
                {s.label}
              </div>
              <strong style={{ color: s.color }}>{fmtCr(s.value)}</strong>
              <span>{fmt(s.pct ?? 0, 1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`glass ${styles.waterfallInsightPanel}`}>
        <div className={styles.waterfallBreakdownHeader}>
          <span className={styles.waterfallBreakdownTitle}>Wealth composition insight</span>
        </div>
        <div className={styles.waterfallInsightRows}>
          <div><span>▰</span><strong>{fmt(marketReturnShare, 1)}%</strong> of your wealth comes from market returns - your portfolio is genuinely compounding.</div>
          <div><span>●</span><strong>{fmt(capitalShare, 1)}%</strong> is from your invested capital - the savings discipline is the foundation.</div>
          <div><span>◎</span>Mutual Funds returned <strong>{fmtPct(mfReturnOnCapital, true)}</strong> on invested capital of {fmtCr(stats.mfInvested)}.</div>
          <div><span>◐</span>Equity stocks returned <strong>{fmtPct(stReturnOnCapital, true)}</strong> on invested capital of {fmtCr(stats.stInvested)}.</div>
        </div>
      </div>
      </div>
    </div>
  );
}

// â”€â”€ ActionView â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ActionView() {
  const { stats, holdings, setActiveView } = usePortfolio();
  const [checked, setChecked] = useState({});

  if (!holdings.length) return (
    <EmptyState
      icon="AS"
      label="No holdings yet"
      sub="Add trades to see your action signals."
      cta="+ Add Trade"
      onCta={() => setActiveView('trade')}
    />
  );

  const topGainer = [...holdings].sort((a, b) => b.returnPct - a.returnPct)[0];
  const topLoser = [...holdings].sort((a, b) => a.returnPct - b.returnPct)[0];
  const holdingLabel = h => h?.assetType === 'MF' ? (h.name || h.symbol) : h?.symbol;

  const pulseCards = [
    { icon: 'UP', title: 'Top Gainer', body: topGainer ? holdingLabel(topGainer) + ' ' + fmtPct(topGainer.returnPct, true) : '-', color: 'var(--green2)' },
    { icon: 'DN', title: 'Underperformer', body: topLoser ? holdingLabel(topLoser) + ' ' + fmtPct(topLoser.returnPct, true) : '-', color: 'var(--red2)' },
    { icon: 'PV', title: 'Portfolio Value', body: fmtCr(stats.totalValue), color: 'var(--accent2)' },
    { icon: 'OR', title: 'Overall Return', body: fmtPct(stats.totalReturnPct, true), color: colorPnl(stats.totalReturnPct) },
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

      <div className={`glass ${styles.signalBanner}`}>
        <div className={styles.signalBannerLabel}>Action Signal</div>
        <div className={styles.signalBannerTitle}>
          {stats.totalReturnPct >= 0
            ? 'Portfolio is in profit - stay the course'
            : 'Portfolio is in loss - review allocation'}
        </div>
        <div className={styles.signalBannerSub}>
          {stats.fundCount + stats.stockCount} holdings - Overall return {fmtPct(stats.totalReturnPct, true)} - CAGR {fmtPct(stats.overallCagr, true)}
        </div>
      </div>

      <div className={`glass ${styles.pulsePanel}`}>
        <div className={styles.pulsePanelTitle}>Portfolio Pulse</div>
        <div className={styles.pulseGrid}>
          {pulseCards.map((c, i) => (
            <div key={i} className={styles.pulseCard}>
              <div className={styles.pulseCardIcon}>{c.icon}</div>
              <div className={styles.pulseCardLabel}>{c.title}</div>
              <div className={styles.pulseCardValue} title={c.body} style={{ color: c.color }}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>

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
                border: `2px solid ${checked[i] ? 'var(--green2)' : 'var(--border2)'}`,
                background: checked[i] ? 'var(--green2)' : 'transparent',
              }}
            >
              {checked[i] ? 'OK' : ''}
            </div>
            <span className={`${styles.checklistText} ${checked[i] ? styles.checklistTextDone : ''}`}>
              {item}
            </span>
          </div>
        ))}
        <div className={styles.checklistSummary}>
          {doneCount} / {checklist.length} done
          {doneCount === checklist.length && ' - All done!'}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ SnapshotView â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            Save a snapshot of today&apos;s portfolio value to track progress over time.
            {/* FIX (Bug 18): inform user that rapid duplicate saves within the same
                minute will update the existing snapshot rather than adding a new one. */}
            {' '}Each snapshot is unique per minute - saving twice within the same minute
            updates the existing entry.
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSaveSnapshot}
          disabled={saving}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? 'Saving...' : 'Save Snapshot Now'}
        </button>
      </div>

      <div className={`glass ${styles.snapshotTablePanel}`}>
        <div className={styles.snapshotTableHeader}>
          <span className={styles.snapshotTableTitle}>Snapshot History</span>
          <span className={styles.snapshotTableCount}>{snapshots.length} saved</span>
        </div>

        {loading ? (
          <div className={styles.snapshotLoading}>Loading...</div>
        ) : snapshots.length === 0 ? (
          <div className={styles.snapshotEmpty}>
            <div className={styles.snapshotEmptyIcon}>SS</div>
            <div className={styles.snapshotEmptyText}>
              No snapshots yet. Click Save Snapshot Now to record your first checkpoint.
            </div>
          </div>
        ) : (
          <table className={styles.snapshotTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Portfolio Value</th>
                <th>Invested</th>
                <th>Realized</th>
                <th>Gain</th>
                <th>Return %</th>
                <th>MF CAGR</th>
                <th>Stock CAGR</th>
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
                    {s.totalRealizedGain != null ? fmtCr(parseFloat(s.totalRealizedGain)) : '-'}
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
                    {s.mfCagr ? fmtPct(parseFloat(s.mfCagr)) : '-'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>
                    {s.stCagr ? fmtPct(parseFloat(s.stCagr)) : '-'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{s.fundCount ?? '-'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{s.stockCount ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
