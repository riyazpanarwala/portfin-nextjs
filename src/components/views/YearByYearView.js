'use client';

import { useState, useMemo } from 'react';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { fmt, fmtCr } from '@/lib/store';
import styles from './YearByYearView.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Compute year-by-year returns from snapshots
// ─────────────────────────────────────────────────────────────────────────────

function tradeAmount(trade) {
  const gross = parseFloat(trade.quantity) * parseFloat(trade.price);
  const brokerage = trade.brokerage ? parseFloat(trade.brokerage) : 0;
  return trade.tradeType === 'BUY' ? gross + brokerage : -(gross - brokerage);
}

function buildTradeYearMap(trades) {
  const map = {};
  (trades || []).forEach(trade => {
    const year = (trade.tradeDate || '').slice(0, 4);
    if (!year) return;
    if (!map[year]) {
      map[year] = { netFlow: 0, buyAmount: 0, sellAmount: 0, tradeCount: 0 };
    }

    const amount = tradeAmount(trade);
    map[year].netFlow += amount;
    map[year].tradeCount += 1;
    if (trade.tradeType === 'BUY') {
      map[year].buyAmount += amount;
    } else {
      map[year].sellAmount += Math.abs(amount);
    }
  });
  return map;
}

function computeYearByYearReturns(snapshots, trades) {
  const tradeYearMap = buildTradeYearMap(trades);

  // Sort snapshots by date
  const sorted = [...snapshots].sort((a, b) =>
    a.snapshotAt.localeCompare(b.snapshotAt)
  );

  // Group snapshots by year
  const yearMap = {};
  sorted.forEach(snap => {
    const year = snap.snapshotAt.slice(0, 4);
    if (!yearMap[year]) {
      yearMap[year] = [];
    }
    yearMap[year].push(snap);
  });

  const allYears = new Set([
    ...Object.keys(tradeYearMap),
    ...Object.keys(yearMap),
  ]);
  const years = [...allYears].sort();
  const results = [];
  let cumulativeInvested = 0;

  years.forEach((year, idx) => {
    const yearSnapshots = yearMap[year] || [];
    const tradeYear = tradeYearMap[year] || {
      netFlow: 0,
      buyAmount: 0,
      sellAmount: 0,
      tradeCount: 0,
    };
    const isCurrentYear = year === new Date().getFullYear().toString();
    const startInvested = cumulativeInvested;
    cumulativeInvested += tradeYear.netFlow;

    // Get start value (last snapshot of previous year or first of current year)
    let startValue = null;
    let startDate = null;
    let endValue = null;
    let endDate = null;

    if (yearSnapshots.length > 0) {
      const prevYear = years
        .slice(0, idx)
        .reverse()
        .find(y => yearMap[y]?.length > 0);

      if (prevYear) {
        const prevYearSnapshots = yearMap[prevYear];
        const lastPrevSnap = prevYearSnapshots[prevYearSnapshots.length - 1];
        startValue = parseFloat(lastPrevSnap.totalValue);
        startDate = lastPrevSnap.snapshotAt.slice(0, 10);
      } else {
        const firstSnap = yearSnapshots[0];
        startValue = parseFloat(firstSnap.totalValue);
        startDate = firstSnap.snapshotAt.slice(0, 10);
      }

      const lastSnap = yearSnapshots[yearSnapshots.length - 1];
      endValue = parseFloat(lastSnap.totalValue);
      endDate = lastSnap.snapshotAt.slice(0, 10);
    }

    // Compute return
    const returnPct =
      startValue > 0 && endValue != null ? ((endValue / startValue - 1) * 100).toFixed(2) : null;
    const absoluteGain = startValue != null && endValue != null ? endValue - startValue : null;

    results.push({
      year,
      startValue,
      endValue,
      startDate,
      endDate,
      startInvested,
      netInvested: cumulativeInvested,
      buyAmount: tradeYear.buyAmount,
      sellAmount: tradeYear.sellAmount,
      netFlow: tradeYear.netFlow,
      tradeCount: tradeYear.tradeCount,
      returnPct: returnPct == null ? null : parseFloat(returnPct),
      absoluteGain,
      isCurrentYear,
      snapshotCount: yearSnapshots.length,
      hasSnapshotValue: yearSnapshots.length > 0,
    });
  });

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute monthly breakdown for a specific year
// ─────────────────────────────────────────────────────────────────────────────

function computeMonthlyBreakdown(snapshots, year) {
  if (!snapshots || !year) return [];

  const filtered = snapshots.filter(s => s.snapshotAt.slice(0, 4) === year);
  if (filtered.length === 0) return [];

  const monthMap = {};
  filtered.forEach(snap => {
    const month = snap.snapshotAt.slice(0, 7); // YYYY-MM
    if (!monthMap[month]) {
      monthMap[month] = snap;
    } else {
      // Keep the latest snapshot for each month
      if (snap.snapshotAt > monthMap[month].snapshotAt) {
        monthMap[month] = snap;
      }
    }
  });

  const months = Object.keys(monthMap).sort();
  const data = [];

  months.forEach((month, idx) => {
    const snap = monthMap[month];
    const value = parseFloat(snap.totalValue);
    const invested = parseFloat(snap.totalInvested);

    // Compute return from start of year
    let monthlyReturn = null;
    if (idx === 0) {
      // First month - no return yet
      monthlyReturn = 0;
    } else {
      const firstSnap = monthMap[months[0]];
      const firstValue = parseFloat(firstSnap.totalValue);
      if (firstValue > 0) {
        monthlyReturn = ((value / firstValue - 1) * 100).toFixed(2);
      }
    }

    data.push({
      month: month.slice(5), // MM
      label: month,
      value,
      invested,
      return: parseFloat(monthlyReturn),
    });
  });

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute weekly breakdown for a specific year
// ─────────────────────────────────────────────────────────────────────────────

function computeWeeklyBreakdown(snapshots, year) {
  if (!snapshots || !year) return [];

  const filtered = snapshots.filter(s => s.snapshotAt.slice(0, 4) === year);
  if (filtered.length === 0) return [];

  // Group by week (ISO week)
  const weekMap = {};
  filtered.forEach(snap => {
    const date = new Date(snap.snapshotAt);
    const weekNum = getISOWeek(date);
    const weekKey = `${year}-W${String(weekNum).padStart(2, '0')}`;

    if (!weekMap[weekKey]) {
      weekMap[weekKey] = snap;
    } else {
      // Keep the latest snapshot for each week
      if (snap.snapshotAt > weekMap[weekKey].snapshotAt) {
        weekMap[weekKey] = snap;
      }
    }
  });

  const weeks = Object.keys(weekMap).sort();
  const data = [];

  weeks.forEach((week, idx) => {
    const snap = weekMap[week];
    const value = parseFloat(snap.totalValue);
    const invested = parseFloat(snap.totalInvested);

    // Compute return from start of year
    let weeklyReturn = null;
    if (idx === 0) {
      weeklyReturn = 0;
    } else {
      const firstSnap = weekMap[weeks[0]];
      const firstValue = parseFloat(firstSnap.totalValue);
      if (firstValue > 0) {
        weeklyReturn = ((value / firstValue - 1) * 100).toFixed(2);
      }
    }

    data.push({
      week: week.slice(6), // W##
      label: week,
      value,
      invested,
      return: parseFloat(weeklyReturn),
    });
  });

  return data;
}

// Helper to get ISO week number
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function YearByYearView({ snapshots = [], trades = [] }) {
  const [selectedYear, setSelectedYear] = useState(null);
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' or 'weekly'

  const yearlyData = useMemo(() => computeYearByYearReturns(snapshots, trades), [snapshots, trades]);
  const snapshotYears = useMemo(() => yearlyData.filter(d => d.hasSnapshotValue), [yearlyData]);

  const breakdownData = useMemo(() => {
    if (!selectedYear) return [];
    if (viewMode === 'monthly') {
      return computeMonthlyBreakdown(snapshots, selectedYear);
    } else {
      return computeWeeklyBreakdown(snapshots, selectedYear);
    }
  }, [snapshots, selectedYear, viewMode]);

  // Prepare chart data for year-by-year returns
  const yearlyReturnChartData = useMemo(() => {
    return snapshotYears.map(d => ({
      label: d.year,
      value: d.returnPct,
      color: d.returnPct >= 0 ? '#10b981' : '#ef4444',
    }));
  }, [snapshotYears]);

  // Prepare chart data for year-by-year invested capital
  const yearlyInvestedChartData = useMemo(() => {
    return yearlyData.map(d => ({
      label: d.year,
      value: d.hasSnapshotValue ? d.endValue : d.netInvested,
      color: d.hasSnapshotValue ? '#3b82f6' : '#64748b',
    }));
  }, [yearlyData]);

  // Prepare breakdown chart data
  const breakdownChartData = useMemo(() => {
    if (viewMode === 'monthly') {
      return breakdownData.map(d => ({
        x: d.month,
        y: d.value,
      }));
    } else {
      return breakdownData.map(d => ({
        x: d.week,
        y: d.value,
      }));
    }
  }, [breakdownData, viewMode]);

  if (!yearlyData || yearlyData.length === 0) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>📊</span>
        <div className={styles.emptyTitle}>No snapshot data available</div>
        <div className={styles.emptySub}>
          Save snapshots over time to see year-by-year analysis
        </div>
      </div>
    );
  }

  const yearsWithReturns = yearlyData.filter(d => d.returnPct != null);
  const bestYear = yearsWithReturns.reduce((a, b) =>
    (b.returnPct || -Infinity) > (a.returnPct || -Infinity) ? b : a
  , yearsWithReturns[0]);
  const worstYear = yearsWithReturns.reduce((a, b) =>
    (b.returnPct || Infinity) < (a.returnPct || Infinity) ? b : a
  , yearsWithReturns[0]);
  const avgReturn =
    yearsWithReturns.length > 0
      ? yearsWithReturns.reduce((s, d) => s + d.returnPct, 0) / yearsWithReturns.length
      : null;
  const latestSnapshotYear = snapshotYears[snapshotYears.length - 1];

  return (
    <div className={styles.container}>
      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Best Year</div>
          <div className={styles.summaryValue} style={{ color: '#10b981' }}>
            {bestYear?.year || '—'}
          </div>
          <div className={styles.summarySub}>
            {bestYear ? `${fmt(bestYear.returnPct, 2)}% return` : 'Need year-end snapshots'}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Worst Year</div>
          <div className={styles.summaryValue} style={{ color: '#ef4444' }}>
            {worstYear?.year || '—'}
          </div>
          <div className={styles.summarySub}>
            {worstYear ? `${fmt(worstYear.returnPct, 2)}% return` : 'Need year-end snapshots'}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Average Return</div>
          <div className={styles.summaryValue} style={{ color: '#3b82f6' }}>
            {avgReturn == null ? '—' : `${fmt(avgReturn, 2)}%`}
          </div>
          <div className={styles.summarySub}>
            Across {yearsWithReturns.length} snapshot year{yearsWithReturns.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Years Tracked</div>
          <div className={styles.summaryValue}>{yearlyData[0].year}–{yearlyData[yearlyData.length - 1].year}</div>
          <div className={styles.summarySub}>
            {latestSnapshotYear ? `${fmtCr(latestSnapshotYear.endValue)} latest snapshot` : 'Trade history only'}
          </div>
        </div>
      </div>

      {/* Year-by-Year Returns Chart */}
      <div className={styles.chartBox}>
        <div className={styles.chartTitle}>Year-by-Year Returns (%)</div>
        <div className={styles.chartSub}>
          Annual return percentage for each calendar year
        </div>
        {yearlyReturnChartData.length > 0
          ? <BarChart data={yearlyReturnChartData} height={200} />
          : <div className={styles.chartEmpty}>Returns need snapshots in each year. Your older years are shown from trades below.</div>}
      </div>

      {/* Year-by-Year Invested Capital Chart */}
      <div className={styles.chartBox}>
        <div className={styles.chartTitle}>Year-End Portfolio Value / Invested Capital</div>
        <div className={styles.chartSub}>
          Snapshot value where available; trade-derived net invested capital for earlier years
        </div>
        <BarChart data={yearlyInvestedChartData} height={200} />
      </div>

      {/* Year Selector and View Mode Toggle */}
      {yearlyData.length > 0 && (
        <>
          <div className={styles.controlsRow}>
            <div className={styles.yearSelector}>
              <div className={styles.selectorLabel}>Select Year for Breakdown</div>
              <div className={styles.yearButtons}>
                {yearlyData.map(d => (
                  <button
                    key={d.year}
                    className={`${styles.yearBtn} ${
                      selectedYear === d.year ? styles.yearBtnActive : ''
                    }`}
                    onClick={() => setSelectedYear(d.year)}
                  >
                    {d.year}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.viewModeToggle}>
              <div className={styles.selectorLabel}>View Mode</div>
              <div className={styles.toggleButtons}>
                <button
                  className={`${styles.toggleBtn} ${
                    viewMode === 'monthly' ? styles.toggleBtnActive : ''
                  }`}
                  onClick={() => setViewMode('monthly')}
                >
                  Monthly
                </button>
                <button
                  className={`${styles.toggleBtn} ${
                    viewMode === 'weekly' ? styles.toggleBtnActive : ''
                  }`}
                  onClick={() => setViewMode('weekly')}
                >
                  Weekly
                </button>
              </div>
            </div>
          </div>

          {/* Breakdown Chart */}
          {selectedYear && breakdownData.length > 0 && (
            <>
              <div className={styles.chartBox}>
                <div className={styles.chartTitle}>
                  {viewMode === 'monthly' ? 'Monthly' : 'Weekly'} Portfolio Value - {selectedYear}
                </div>
                <div className={styles.chartSub}>
                  {viewMode === 'monthly'
                    ? 'Portfolio value at month-end'
                    : 'Portfolio value at week-end'}
                </div>
                <LineChart
                  data={breakdownChartData}
                  height={220}
                  xKey="x"
                  yKey="y"
                  color="#3b82f6"
                />
              </div>

              {/* Breakdown Table */}
              <div className={styles.tableBox}>
                <div className={styles.tableTitle}>
                  {viewMode === 'monthly' ? 'Monthly' : 'Weekly'} Breakdown - {selectedYear}
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>{viewMode === 'monthly' ? 'Month' : 'Week'}</th>
                        <th style={{ textAlign: 'right' }}>Portfolio Value</th>
                        <th style={{ textAlign: 'right' }}>Total Invested</th>
                        <th style={{ textAlign: 'right' }}>Return from YoY Start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownData.map((d, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{d.label}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {fmtCr(d.value)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {fmtCr(d.invested)}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color:
                                d.return >= 0 ? '#10b981' : '#ef4444',
                              fontWeight: 600,
                            }}
                          >
                            {fmt(d.return, 2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Year-by-Year Summary Table */}
          <div className={styles.tableBox}>
            <div className={styles.tableTitle}>Year-by-Year Summary</div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th style={{ textAlign: 'right' }}>Start Value</th>
                    <th style={{ textAlign: 'right' }}>End Value</th>
                    <th style={{ textAlign: 'right' }}>Net Invested</th>
                    <th style={{ textAlign: 'right' }}>Absolute Gain</th>
                    <th style={{ textAlign: 'right' }}>Return %</th>
                    <th style={{ textAlign: 'right' }}>Trades</th>
                    <th style={{ textAlign: 'right' }}>Snapshots</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyData.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{d.year}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {fmtCr(d.startValue)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {fmtCr(d.endValue)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {fmtCr(d.netInvested)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          color: d.absoluteGain == null ? 'var(--text3)' : d.absoluteGain >= 0 ? '#10b981' : '#ef4444',
                          fontWeight: 600,
                        }}
                      >
                        {fmtCr(d.absoluteGain)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                              color: d.returnPct == null ? 'var(--text3)' : d.returnPct >= 0 ? '#10b981' : '#ef4444',
                              fontWeight: 700,
                            }}
                          >
                        {d.returnPct == null ? '—' : `${fmt(d.returnPct, 2)}%`}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>
                        {d.tradeCount}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>
                        {d.snapshotCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
