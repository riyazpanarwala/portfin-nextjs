'use client';

import { useState, useMemo } from 'react';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { fmt, fmtCr } from '@/lib/store';
import styles from './YearByYearView.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tradeAmount(trade) {
  const gross = parseFloat(trade.quantity) * parseFloat(trade.price);
  const brokerage = trade.brokerage ? parseFloat(trade.brokerage) : 0;
  // BUY = cash outflow (positive number = money deployed)
  // SELL = cash inflow (negative number = money returned)
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
      map[year].buyAmount += Math.abs(amount);
    } else {
      map[year].sellAmount += Math.abs(amount);
    }
  });
  return map;
}

/**
 * computeYearByYearReturns
 *
 * For each year we compute:
 *   startValue   – last snapshot of the PREVIOUS year (portfolio value at year start)
 *   endValue     – last snapshot of THIS year
 *   netAdded     – net new capital deployed this year (buys - sells)
 *   marketGain   – endValue - startValue - netAdded
 *                  This isolates market performance from new money flowing in.
 *   returnPct    – point-to-point snapshot return (endValue/startValue - 1)
 *                  Only meaningful when startValue is from end of previous full year.
 *   cumulativeInvested – running total of net capital ever deployed, at year end
 *
 * KEY FIX: Previously absoluteGain = endValue - startValue, which conflated
 * new capital deployments with market returns. For 2017 (first year) where
 * ₹7,988 was the first snapshot mid-year and ₹66,276 was the year-end snapshot
 * — most of that difference was new money being added, not 729% returns.
 */
function computeYearByYearReturns(snapshots, trades) {
  const tradeYearMap = buildTradeYearMap(trades);

  // Sort snapshots by date
  const sorted = [...snapshots].sort((a, b) =>
    a.snapshotAt.localeCompare(b.snapshotAt)
  );

  // Group snapshots by year, keep only the LAST snapshot per year
  const yearLastSnap = {};
  sorted.forEach(snap => {
    const year = snap.snapshotAt.slice(0, 4);
    yearLastSnap[year] = snap; // overwrite → last one wins
  });

  // Also keep the first snapshot per year (for detecting partial years)
  const yearFirstSnap = {};
  sorted.forEach(snap => {
    const year = snap.snapshotAt.slice(0, 4);
    if (!yearFirstSnap[year]) yearFirstSnap[year] = snap;
  });

  // Count snapshots per year
  const yearSnapCount = {};
  sorted.forEach(snap => {
    const year = snap.snapshotAt.slice(0, 4);
    yearSnapCount[year] = (yearSnapCount[year] || 0) + 1;
  });

  const allYears = new Set([
    ...Object.keys(tradeYearMap),
    ...Object.keys(yearLastSnap),
  ]);
  const years = [...allYears].sort();

  const results = [];
  let cumulativeInvested = 0; // running net capital deployed

  years.forEach((year, idx) => {
    const tradeYear = tradeYearMap[year] || {
      netFlow: 0, buyAmount: 0, sellAmount: 0, tradeCount: 0,
    };

    // Net capital added this year (positive = bought more than sold)
    const netAdded = tradeYear.netFlow;
    cumulativeInvested += netAdded;

    const isCurrentYear = year === new Date().getFullYear().toString();
    const snapshotCount = yearSnapCount[year] || 0;
    const hasSnapshotValue = snapshotCount > 0;

    // End value = last snapshot this year
    const endSnap = yearLastSnap[year] || null;
    const endValue = endSnap ? parseFloat(endSnap.totalValue) : null;
    const endDate = endSnap ? endSnap.snapshotAt.slice(0, 10) : null;

    // Start value = last snapshot of the previous year that had snapshots
    let startValue = null;
    let startDate = null;
    for (let i = idx - 1; i >= 0; i--) {
      const prevYear = years[i];
      if (yearLastSnap[prevYear]) {
        startValue = parseFloat(yearLastSnap[prevYear].totalValue);
        startDate = yearLastSnap[prevYear].snapshotAt.slice(0, 10);
        break;
      }
    }

    // isFirstSnapshotYear = no prior year had snapshots
    const isFirstSnapshotYear = hasSnapshotValue && startValue === null;

    // Partial year: current year, or first snapshot year, or last snapshot
    // wasn't in December (meaning we don't have a full-year end point)
    const isPartialSnapshotYear =
      hasSnapshotValue &&
      (isCurrentYear ||
        isFirstSnapshotYear ||
        endDate?.slice(5, 7) !== '12');

    // ── Market gain = how much the portfolio grew due to market, not new money ──
    // Formula: endValue - startValue - netAdded
    // If startValue is null (first year with snapshots), we can't isolate it cleanly.
    let marketGain = null;
    if (endValue != null && startValue != null) {
      marketGain = endValue - startValue - netAdded;
    }

    // ── Snapshot return % (point-to-point) ──
    // Only computed when we have both a clean start and end snapshot.
    // Excluded for first-snapshot years since startValue = null.
    const returnPct =
      startValue != null && startValue > 0 && endValue != null
        ? parseFloat(((endValue / startValue - 1) * 100).toFixed(2))
        : null;

    results.push({
      year,
      startValue,
      endValue,
      startDate,
      endDate,
      netAdded,
      buyAmount: tradeYear.buyAmount,
      sellAmount: tradeYear.sellAmount,
      tradeCount: tradeYear.tradeCount,
      cumulativeInvested,   // total net capital deployed up to end of this year
      marketGain,           // market-only gain this year (net of new money)
      returnPct,            // snapshot-to-snapshot return %
      isCurrentYear,
      isFirstSnapshotYear,
      isPartialSnapshotYear,
      snapshotCount,
      hasSnapshotValue,
    });
  });

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly / Weekly breakdown helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function computeMonthlyBreakdown(snapshots, year) {
  if (!snapshots || !year) return [];
  const filtered = snapshots.filter(s => s.snapshotAt.slice(0, 4) === year);
  if (filtered.length === 0) return [];
  const monthMap = {};
  filtered.forEach(snap => {
    const month = snap.snapshotAt.slice(0, 7);
    if (!monthMap[month] || snap.snapshotAt > monthMap[month].snapshotAt)
      monthMap[month] = snap;
  });
  const months = Object.keys(monthMap).sort();
  return months.map((month, idx) => {
    const snap = monthMap[month];
    const value = parseFloat(snap.totalValue);
    const invested = parseFloat(snap.totalInvested);
    let monthlyReturn = 0;
    if (idx > 0) {
      const firstValue = parseFloat(monthMap[months[0]].totalValue);
      if (firstValue > 0) monthlyReturn = parseFloat(((value / firstValue - 1) * 100).toFixed(2));
    }
    return { month: month.slice(5), label: month, value, invested, return: monthlyReturn };
  });
}

function computeWeeklyBreakdown(snapshots, year) {
  if (!snapshots || !year) return [];
  const filtered = snapshots.filter(s => s.snapshotAt.slice(0, 4) === year);
  if (filtered.length === 0) return [];
  const weekMap = {};
  filtered.forEach(snap => {
    const date = new Date(snap.snapshotAt);
    const weekNum = getISOWeek(date);
    const weekKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
    if (!weekMap[weekKey] || snap.snapshotAt > weekMap[weekKey].snapshotAt)
      weekMap[weekKey] = snap;
  });
  const weeks = Object.keys(weekMap).sort();
  return weeks.map((week, idx) => {
    const snap = weekMap[week];
    const value = parseFloat(snap.totalValue);
    const invested = parseFloat(snap.totalInvested);
    let weeklyReturn = 0;
    if (idx > 0) {
      const firstValue = parseFloat(weekMap[weeks[0]].totalValue);
      if (firstValue > 0) weeklyReturn = parseFloat(((value / firstValue - 1) * 100).toFixed(2));
    }
    return { week: week.slice(6), label: week, value, invested, return: weeklyReturn };
  });
}

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
  const [viewMode, setViewMode] = useState('monthly');

  const yearlyData = useMemo(
    () => computeYearByYearReturns(snapshots, trades),
    [snapshots, trades]
  );
  const snapshotYears = useMemo(
    () => yearlyData.filter(d => d.hasSnapshotValue),
    [yearlyData]
  );

  const breakdownData = useMemo(() => {
    if (!selectedYear) return [];
    return viewMode === 'monthly'
      ? computeMonthlyBreakdown(snapshots, selectedYear)
      : computeWeeklyBreakdown(snapshots, selectedYear);
  }, [snapshots, selectedYear, viewMode]);

  // Only include complete, non-partial years in best/worst/average
  const completedReturnYears = yearlyData.filter(
    d => d.returnPct != null && !d.isPartialSnapshotYear
  );

  const bestYear = completedReturnYears.reduce(
    (a, b) => (b.returnPct > (a?.returnPct ?? -Infinity) ? b : a),
    null
  );
  const worstYear = completedReturnYears.reduce(
    (a, b) => (b.returnPct < (a?.returnPct ?? Infinity) ? b : a),
    null
  );
  const avgReturn =
    completedReturnYears.length > 0
      ? completedReturnYears.reduce((s, d) => s + d.returnPct, 0) / completedReturnYears.length
      : null;
  const latestSnapshotYear = snapshotYears[snapshotYears.length - 1];

  // Chart data
  const yearlyReturnChartData = useMemo(
    () =>
      completedReturnYears.map(d => ({
        label: d.year,
        value: d.returnPct,
        color: d.returnPct >= 0 ? '#10b981' : '#ef4444',
      })),
    [completedReturnYears]
  );

  const yearlyValueChartData = useMemo(
    () =>
      yearlyData.map(d => ({
        label: d.year,
        value: d.hasSnapshotValue ? (d.endValue ?? 0) : d.cumulativeInvested,
        color: d.hasSnapshotValue ? '#3b82f6' : '#64748b',
      })),
    [yearlyData]
  );

  const breakdownChartData = useMemo(
    () =>
      breakdownData.map(d => ({
        x: viewMode === 'monthly' ? d.month : d.week,
        y: d.value,
      })),
    [breakdownData, viewMode]
  );

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

  return (
    <div className={styles.container}>

      {/* ── Summary Cards ── */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Best Year</div>
          <div className={styles.summaryValue} style={{ color: '#10b981' }}>
            {bestYear?.year || '—'}
          </div>
          <div className={styles.summarySub}>
            {bestYear ? `${fmt(bestYear.returnPct, 2)}% return` : 'Need full-year snapshots'}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Worst Year</div>
          <div className={styles.summaryValue} style={{ color: '#ef4444' }}>
            {worstYear?.year || '—'}
          </div>
          <div className={styles.summarySub}>
            {worstYear ? `${fmt(worstYear.returnPct, 2)}% return` : 'Need full-year snapshots'}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Average Return</div>
          <div className={styles.summaryValue} style={{ color: '#3b82f6' }}>
            {avgReturn == null ? '—' : `${fmt(avgReturn, 2)}%`}
          </div>
          <div className={styles.summarySub}>
            Across {completedReturnYears.length} full snapshot year{completedReturnYears.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Years Tracked</div>
          <div className={styles.summaryValue}>
            {yearlyData[0].year}–{yearlyData[yearlyData.length - 1].year}
          </div>
          <div className={styles.summarySub}>
            {latestSnapshotYear
              ? `${fmtCr(latestSnapshotYear.endValue)} latest snapshot`
              : 'Trade history only'}
          </div>
        </div>
      </div>

      {/* ── Year-by-Year Returns Chart ── */}
      <div className={styles.chartBox}>
        <div className={styles.chartTitle}>Snapshot-Based Returns (%)</div>
        <div className={styles.chartSub}>
          Point-to-point: last snapshot of prior year → last snapshot of this year.
          Partial / first / YTD years are excluded.
        </div>
        {yearlyReturnChartData.length > 0 ? (
          <BarChart
            data={yearlyReturnChartData}
            height={200}
            valueFormatter={v => `${fmt(v, 2)}%`}
          />
        ) : (
          <div className={styles.chartEmpty}>
            Returns need snapshots saved in multiple years. Your trade history is shown below.
          </div>
        )}
      </div>

      {/* ── Year-End Portfolio Value Chart ── */}
      <div className={styles.chartBox}>
        <div className={styles.chartTitle}>Year-End Portfolio Value / Invested Capital</div>
        <div className={styles.chartSub}>
          Blue = snapshot value; grey = trade-derived cumulative invested capital (no snapshot)
        </div>
        <BarChart data={yearlyValueChartData} height={200} />
      </div>

      {/* ── Year Selector + View Mode ── */}
      {snapshotYears.length > 0 && (
        <div className={styles.controlsRow}>
          <div className={styles.yearSelector}>
            <div className={styles.selectorLabel}>Select Snapshot Year for Breakdown</div>
            <div className={styles.yearButtons}>
              {snapshotYears.map(d => (
                <button
                  key={d.year}
                  className={`${styles.yearBtn} ${selectedYear === d.year ? styles.yearBtnActive : ''}`}
                  onClick={() => setSelectedYear(d.year)}
                >
                  {d.year}
                  {d.isPartialSnapshotYear && (
                    <span className={styles.yearBtnMeta}>partial</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.viewModeToggle}>
            <div className={styles.selectorLabel}>View Mode</div>
            <div className={styles.toggleButtons}>
              <button
                className={`${styles.toggleBtn} ${viewMode === 'monthly' ? styles.toggleBtnActive : ''}`}
                onClick={() => setViewMode('monthly')}
              >
                Monthly
              </button>
              <button
                className={`${styles.toggleBtn} ${viewMode === 'weekly' ? styles.toggleBtnActive : ''}`}
                onClick={() => setViewMode('weekly')}
              >
                Weekly
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Breakdown Chart + Table ── */}
      {selectedYear && breakdownData.length > 0 && (
        <>
          <div className={styles.chartBox}>
            <div className={styles.chartTitle}>
              {viewMode === 'monthly' ? 'Monthly' : 'Weekly'} Portfolio Value — {selectedYear}
            </div>
            <div className={styles.chartSub}>
              {viewMode === 'monthly' ? 'Last snapshot value per month' : 'Last snapshot value per ISO week'}
            </div>
            <LineChart data={breakdownChartData} height={220} xKey="x" yKey="y" color="#3b82f6" />
          </div>

          <div className={styles.tableBox}>
            <div className={styles.tableTitle}>
              {viewMode === 'monthly' ? 'Monthly' : 'Weekly'} Breakdown — {selectedYear}
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
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCr(d.value)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCr(d.invested)}</td>
                      <td style={{
                        textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600,
                        color: d.return >= 0 ? '#10b981' : '#ef4444',
                      }}>
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

      {/* ── Portfolio History Summary Table ── */}
      <div className={styles.tableBox}>
        <div className={styles.tableTitle}>Portfolio History Summary</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text2)' }}>Market Gain</strong> = portfolio value change
          minus new capital added. Isolates market performance from new money deployed.
          — shown as — for the first snapshot year (no clean prior year-end baseline).
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Year</th>
                <th style={{ textAlign: 'right' }}>Start Value</th>
                <th style={{ textAlign: 'right' }}>End Value</th>
                <th style={{ textAlign: 'right' }}>Net Added</th>
                <th style={{ textAlign: 'right' }}>Market Gain</th>
                <th style={{ textAlign: 'right' }}>Cumul. Invested</th>
                <th style={{ textAlign: 'right' }}>Snapshot Return %</th>
                <th style={{ textAlign: 'right' }}>Trades</th>
                <th style={{ textAlign: 'right' }}>Snapshots</th>
              </tr>
            </thead>
            <tbody>
              {yearlyData.map((d, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>
                    <span className={styles.yearCell}>
                      {d.year}
                      {d.isPartialSnapshotYear && (
                        <span className={styles.partialBadge}>
                          {d.isCurrentYear ? 'YTD' : d.isFirstSnapshotYear ? 'first' : 'partial'}
                        </span>
                      )}
                    </span>
                  </td>

                  {/* Start Value */}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                    {d.startValue != null ? fmtCr(d.startValue) : '—'}
                  </td>

                  {/* End Value */}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {d.endValue != null ? fmtCr(d.endValue) : '—'}
                  </td>

                  {/* Net Added this year (buys minus sells) */}
                  <td style={{
                    textAlign: 'right', fontFamily: 'var(--font-mono)',
                    color: d.netAdded >= 0 ? 'var(--accent2)' : 'var(--yellow)',
                  }}>
                    {d.netAdded !== 0
                      ? `${d.netAdded >= 0 ? '+' : ''}${fmtCr(d.netAdded)}`
                      : '—'}
                  </td>

                  {/* Market Gain = endValue - startValue - netAdded */}
                  <td style={{
                    textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600,
                    color: d.marketGain == null
                      ? 'var(--text3)'
                      : d.marketGain >= 0 ? '#10b981' : '#ef4444',
                  }}>
                    {d.marketGain != null
                      ? `${d.marketGain >= 0 ? '+' : ''}${fmtCr(d.marketGain)}`
                      : '—'}
                  </td>

                  {/* Cumulative net invested at year-end */}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>
                    {fmtCr(d.cumulativeInvested)}
                  </td>

                  {/* Snapshot Return % */}
                  <td style={{
                    textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700,
                    color: d.returnPct == null ? 'var(--text3)' : d.returnPct >= 0 ? '#10b981' : '#ef4444',
                  }}>
                    {d.returnPct == null ? '—' : `${fmt(d.returnPct, 2)}%`}
                    {d.returnPct != null && d.isPartialSnapshotYear && (
                      <span className={styles.returnNote}>snapshot period</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{d.tradeCount}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{d.snapshotCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
