import { useMemo } from 'react';
import styles from '../PortfolioVsNiftyView.module.css';
import {
  calculatePointReturn,
  formatReturn,
  formatSignedMagnitude,
  getReturnColor,
  getShortBenchmarkLabel,
  mapByMonth,
} from './helpers';

function lastValueInYear(map, year) {
  for (let month = 12; month >= 1; month--) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (map[key] != null) return { value: map[key], month: key };
  }
  return null;
}

function computeCalendarYearReturns(portfolioSeries, activeBenchSeries) {
  if (!portfolioSeries.length) return [];

  const pMap = mapByMonth(portfolioSeries);
  const years = [...new Set(portfolioSeries.map(d => d.month.slice(0, 4)))].sort();
  const benchMaps = activeBenchSeries.map(benchmark => mapByMonth(benchmark.data));
  const currentYearStr = new Date().toISOString().slice(0, 4);
  const firstSnapshotYear = years[0];

  return years.map(year => {
    const isCurrentYearValue = year === currentYearStr;
    const isFirstYear = year === firstSnapshotYear;
    const prevYear = String(parseInt(year) - 1);
    const prevYearEnd = lastValueInYear(pMap, prevYear);
    const pStart = prevYearEnd?.value ?? null;
    const pEnd = lastValueInYear(pMap, year);
    const isPartial = isCurrentYearValue || pEnd?.month?.slice(5) !== '12';
    const pRet = calculatePointReturn(pStart, pEnd?.value);

    const benchReturns = activeBenchSeries.map((benchmark, benchIndex) => {
      const map = benchMaps[benchIndex];
      const bPrevEnd = lastValueInYear(map, prevYear);
      const bStart = bPrevEnd?.value ?? null;
      const bEnd = lastValueInYear(map, year);
      const bRet = calculatePointReturn(bStart, bEnd?.value);
      const alpha = pRet != null && bRet != null ? pRet - bRet : null;
      return { key: benchmark.key, label: benchmark.label, color: benchmark.color, ret: bRet, alpha };
    });

    return { year, pRet, benchReturns, isPartial, isFirstYear };
  });
}

function CalendarSummaryChip({ label, children, borderColor, background, color }) {
  return (
    <div className={styles.calSummaryChip} style={{ borderColor, background }}>
      <div className={styles.calSummaryChipLabel}>{label}</div>
      <div className={styles.calSummaryChipValue} style={{ color }}>
        {children}
      </div>
    </div>
  );
}

function CalendarReturnCell({ value }) {
  return (
    <td className={styles.calTdValue} style={{ color: getReturnColor(value) }}>
      {formatReturn(value)}
    </td>
  );
}

function CalendarMutedCells({ items, keyPrefix = '' }) {
  return items.map(item => (
    <td key={`${keyPrefix}${item.key}`} className={styles.calTdMuted}>…</td>
  ));
}

function CalendarAlphaCell({ benchmark }) {
  const alpha = benchmark.alpha;

  return (
    <td key={`alpha-${benchmark.key}`}>
      {alpha != null ? (
        <span className={`${styles.calAlphaChip} ${alpha > 0 ? styles.calAlphaWin : styles.calAlphaLoss}`}>
          {alpha > 0 ? '▲' : '▼'} {formatSignedMagnitude(alpha)}
        </span>
      ) : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
    </td>
  );
}

function CalendarPerformanceBar({ value }) {
  return (
    <td className={styles.calTdBar}>
      {value != null && (
        <div className={styles.calBarWrapper}>
          <div className={styles.calBar} style={{
            width: `${Math.min(100, Math.abs(value) * 1.5)}%`,
            background: value >= 0 ? 'var(--green2)' : 'var(--red2)',
            opacity: 0.75,
          }} />
        </div>
      )}
    </td>
  );
}

function isCurrentYear(year) {
  return year === new Date().toISOString().slice(0, 4);
}

export default function CalendarYearReturns({ portfolioSeries, activeBenchSeries, benchLoading }) {
  const rows = useMemo(
    () => computeCalendarYearReturns(portfolioSeries, activeBenchSeries),
    [portfolioSeries, activeBenchSeries],
  );

  if (!rows.length) return null;

  const completedRows = rows.filter(row => !row.isPartial && !row.isFirstYear && row.pRet != null);
  const bestRow  = completedRows.length ? completedRows.reduce((a, b) => (b.pRet > a.pRet ? b : a)) : null;
  const worstRow = completedRows.length ? completedRows.reduce((a, b) => (b.pRet < a.pRet ? b : a)) : null;
  const winsCount = completedRows.filter(row => row.benchReturns[0]?.alpha != null && row.benchReturns[0].alpha > 0).length;
  const lossCount = completedRows.filter(row => row.benchReturns[0]?.alpha != null && row.benchReturns[0].alpha <= 0).length;
  const hasBench  = activeBenchSeries.length > 0;

  return (
    <div>
      {completedRows.length > 0 && (
        <div className={styles.calSummaryRow}>
          {bestRow && (
            <CalendarSummaryChip
              label="Best year"
              borderColor="rgba(52,211,153,0.4)"
              background="rgba(52,211,153,0.07)"
              color="var(--green2)"
            >
              {bestRow.year} · {formatReturn(bestRow.pRet)}
            </CalendarSummaryChip>
          )}
          {worstRow && (
            <CalendarSummaryChip
              label="Worst year"
              borderColor="rgba(248,113,113,0.4)"
              background="rgba(248,113,113,0.07)"
              color="var(--red2)"
            >
              {worstRow.year} · {formatReturn(worstRow.pRet)}
            </CalendarSummaryChip>
          )}
          {hasBench && completedRows.length > 0 && (
            <CalendarSummaryChip
              label={`Beat ${activeBenchSeries[0]?.label}`}
              borderColor="rgba(59,130,246,0.3)"
              background="rgba(59,130,246,0.06)"
              color={winsCount >= lossCount ? 'var(--green2)' : 'var(--red2)'}
            >
              {winsCount}W / {lossCount}L
              <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                ({completedRows.length} full years)
              </span>
            </CalendarSummaryChip>
          )}
          {completedRows.length > 0 && (() => {
            const avg = completedRows.reduce((sum, row) => sum + row.pRet, 0) / completedRows.length;
            return (
              <CalendarSummaryChip
                label="Avg annual return"
                borderColor="rgba(139,92,246,0.3)"
                background="rgba(139,92,246,0.06)"
                color="var(--purple)"
              >
                {formatReturn(avg)}
                <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>arithmetic</span>
              </CalendarSummaryChip>
            );
          })()}
        </div>
      )}

      <div className={styles.calTableWrapper}>
        <table>
          <thead>
            <tr>
              <th className={styles.calTh}>Year</th>
              <th className={styles.calThRight}>Portfolio</th>
              {activeBenchSeries.map(benchmark => (
                <th key={benchmark.key} className={styles.calThRight} style={{ color: benchmark.color }}>{benchmark.label}</th>
              ))}
              {hasBench && activeBenchSeries.map(benchmark => (
                <th key={`alpha-${benchmark.key}`} className={styles.calThRight}>
                  Alpha vs {benchmark.shortLabel ?? getShortBenchmarkLabel(benchmark)}
                </th>
              ))}
              <th className={styles.calTh}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map(({ year, pRet, benchReturns, isPartial, isFirstYear }) => {
              const showPartialBadge = isPartial || isFirstYear;
              return (
                <tr key={year} className={showPartialBadge ? styles.calRowPartial : styles.calRow}>
                  <td className={styles.calTdYear}>
                    <span className={styles.calYearText}>{year}</span>
                    {isCurrentYear(year) && (
                      <span className={styles.calPartialBadge}>YTD</span>
                    )}
                    {isFirstYear && !isCurrentYear(year) && (
                      <span className={styles.calPartialBadge}>first</span>
                    )}
                    {isPartial && !isFirstYear && !isCurrentYear(year) && (
                      <span className={styles.calPartialBadge}>partial</span>
                    )}
                  </td>
                  <CalendarReturnCell value={pRet} />
                  {benchLoading
                    ? <CalendarMutedCells items={activeBenchSeries} />
                    : benchReturns.map(benchmark => <CalendarReturnCell key={benchmark.key} value={benchmark.ret} />)
                  }
                  {hasBench && (benchLoading
                    ? <CalendarMutedCells items={activeBenchSeries} keyPrefix="alpha-" />
                    : benchReturns.map(benchmark => <CalendarAlphaCell key={`alpha-${benchmark.key}`} benchmark={benchmark} />)
                  )}
                  <CalendarPerformanceBar value={pRet} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.calFootnote}>
        Returns are Jan–Dec point-to-point using the last Dec snapshot vs last Dec snapshot of prior year.
        First year shows &quot;—&quot; (no prior year-end baseline). YTD uses latest available snapshot.
        Alpha = portfolio return − benchmark return for the same calendar year.
        {benchLoading && <span style={{ color: 'var(--yellow)', marginLeft: 6 }}>Benchmark data loading…</span>}
      </div>
    </div>
  );
}
