import { useMemo } from 'react';
import styles from '../PortfolioVsNiftyView.module.css';
import {
  ROLLING_PERIODS,
  calculatePointReturn,
  closestMonthAtOrBefore,
  formatReturn,
  formatSignedMagnitude,
  getReturnColor,
  mapByMonth,
  subtractMonths,
} from './helpers';

function RollingPortfolioRow({ value }) {
  return (
    <div className={styles.rollingRow}>
      <span className={styles.rollingPortfolioLabel}>● Portfolio</span>
      <span className={styles.rollingValue} style={{ color: getReturnColor(value) }}>
        {formatReturn(value)}
      </span>
    </div>
  );
}

function RollingBenchmarkRow({ benchmark, value, alpha, showSIPLabel = false }) {
  const labelSuffix = showSIPLabel ? ' (SIP)' : '';
  const alphaSuffix = showSIPLabel ? ' SIP' : '';

  return (
    <div>
      <div className={styles.rollingRow}>
        <span className={styles.rollingBenchLabel} style={{ color: benchmark.color }}>
          ● {benchmark.label}{labelSuffix}
        </span>
        <span className={styles.rollingValue} style={{ color: getReturnColor(value) }}>
          {formatReturn(value)}
        </span>
      </div>
      {alpha != null && (
        <div className={`${styles.alphaChip} ${alpha > 0 ? styles.alphaChipWin : styles.alphaChipLoss}`}>
          <span
            className={styles.alphaChipText}
            style={{ color: alpha > 0 ? 'var(--green2)' : 'var(--red2)' }}
          >
            {alpha > 0 ? '▲' : '▼'} vs {benchmark.shortLabel ?? benchmark.label}{alphaSuffix}: {formatSignedMagnitude(alpha)}
          </span>
        </div>
      )}
    </div>
  );
}

function RollingLoadingHint() {
  return <div className={styles.rollingLoadingHint}>Loading benchmark data…</div>;
}

function RollingInsufficientCard({ label }) {
  return (
    <div className={styles.rollingCardInsufficient}>
      <div className={styles.rollingCardPeriodLabel}>{label}</div>
      <div className={styles.rollingCardInsufficientSub}>Insufficient data</div>
    </div>
  );
}

function getBenchmarkPointReturn(benchmark, targetFromMonth, lastMonth) {
  const benchMap = mapByMonth(benchmark.data);
  const benchMonths = benchmark.data.map(d => d.month).sort();
  const fromMonth = closestMonthAtOrBefore(benchMonths, targetFromMonth);
  const start = fromMonth ? benchMap[fromMonth] : null;
  const end = benchMap[lastMonth] ?? benchMap[benchMonths[benchMonths.length - 1]];
  return calculatePointReturn(start, end);
}

export default function RollingReturns({ portfolioSeries, activeBenchSeries, benchLoading, trades }) {
  const pMap = useMemo(() => mapByMonth(portfolioSeries), [portfolioSeries]);

  const allMonths = useMemo(() =>
    [...new Set(portfolioSeries.map(d => d.month))].sort(),
    [portfolioSeries]
  );

  const lastMonth = allMonths[allMonths.length - 1];

  const sipBenchReturns = useMemo(() => {
    if (!trades?.length || !lastMonth || !allMonths.length) return {};

    const monthlyBuys = {};
    for (const trade of trades) {
      if (trade.tradeType !== 'BUY') continue;
      const month  = trade.tradeDate.slice(0, 7);
      const amount = parseFloat(trade.quantity) * parseFloat(trade.price);
      monthlyBuys[month] = (monthlyBuys[month] || 0) + amount;
    }

    const periodStarts = {
      max: allMonths[0],
      '6m':  subtractMonths(lastMonth, 6),
      '1y':  subtractMonths(lastMonth, 12),
      '2y':  subtractMonths(lastMonth, 24),
      '3y':  subtractMonths(lastMonth, 36),
    };

    function computeSIPReturn(benchmark, startMonth) {
      if (benchmark.key === 'fd') {
        let totalValue    = 0;
        let totalInvested = 0;
        for (const [month, amount] of Object.entries(monthlyBuys)) {
          if (month < startMonth) continue;
          const [year, buyMonth] = month.split('-').map(Number);
          const [lastYear, lastBuyMonth] = lastMonth.split('-').map(Number);
          const monthsHeld = (lastYear - year) * 12 + (lastBuyMonth - buyMonth);
          totalValue    += amount * Math.pow(1 + 0.071 / 12, monthsHeld);
          totalInvested += amount;
        }
        return totalInvested > 0
          ? ((totalValue - totalInvested) / totalInvested) * 100
          : null;
      }

      const benchMap = mapByMonth(benchmark.data);
      const benchMonths = benchmark.data.map(d => d.month).sort();

      function closestBenchLevel(targetMonth) {
        const key = closestMonthAtOrBefore(benchMonths, targetMonth, benchMonths[0]);
        return benchMap[key] ?? null;
      }

      const currentLevel = benchMap[lastMonth] ?? benchMap[benchMonths[benchMonths.length - 1]];
      if (!currentLevel) return null;

      let totalUnits    = 0;
      let totalInvested = 0;

      for (const [month, amount] of Object.entries(monthlyBuys)) {
        if (month < startMonth) continue;
        const levelAtBuy = closestBenchLevel(month);
        if (!levelAtBuy || levelAtBuy <= 0) continue;
        totalUnits    += amount / levelAtBuy;
        totalInvested += amount;
      }

      if (!totalInvested) return null;
      return ((totalUnits * currentLevel - totalInvested) / totalInvested) * 100;
    }

    const results = {};
    for (const [periodKey, startMonth] of Object.entries(periodStarts)) {
      results[periodKey] = {};
      for (const benchmark of activeBenchSeries) {
        results[periodKey][benchmark.key] = computeSIPReturn(benchmark, startMonth);
      }
    }
    return results;
  }, [trades, activeBenchSeries, lastMonth, allMonths]);

  return (
    <div className={styles.rollingGrid}>
      {ROLLING_PERIODS.map(({ label, months, periodKey }) => {
        if (months === null) {
          const fromMonth   = allMonths[0];
          const lastSnap    = portfolioSeries[portfolioSeries.length - 1];
          const pRet        = lastSnap?.returnPct ?? null;
          const [startYear] = fromMonth.split('-');
          const [endYear]   = lastMonth.split('-');
          const rangeLabel  = startYear === endYear ? startYear : `${startYear}–${endYear}`;

          return (
            <div
              key={label}
              className={styles.rollingCard}
              style={{
                border:     '1px solid rgba(139,92,246,0.35)',
                background: 'rgba(139,92,246,0.06)',
              }}
            >
              <div className={styles.rollingCardHeader} style={{ color: 'var(--purple)' }}>
                MAX RETURN · {rangeLabel}
              </div>
              <RollingPortfolioRow value={pRet} />
              {benchLoading ? (
                <RollingLoadingHint />
              ) : (
                <>
                  {activeBenchSeries.map(benchmark => {
                    const bRet  = sipBenchReturns.max?.[benchmark.key] ?? null;
                    const alpha = pRet != null && bRet != null ? pRet - bRet : null;
                    return (
                      <RollingBenchmarkRow
                        key={benchmark.key}
                        benchmark={benchmark}
                        value={bRet}
                        alpha={alpha}
                        showSIPLabel
                      />
                    );
                  })}
                  <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 6, lineHeight: 1.6 }}>
                    Both use same SIP amounts on same dates. True apples-to-apples comparison.
                  </div>
                </>
              )}
            </div>
          );
        }

        const targetFromMonth  = subtractMonths(lastMonth, months);
        const fromMonth        = closestMonthAtOrBefore(allMonths, targetFromMonth);
        const minRequiredMonth = subtractMonths(lastMonth, Math.floor(months * 1.25));

        if (!fromMonth || fromMonth < minRequiredMonth || fromMonth >= lastMonth) {
          return <RollingInsufficientCard key={label} label={label} />;
        }

        const pRet = calculatePointReturn(pMap[fromMonth], pMap[lastMonth]);

        return (
          <div
            key={label}
            className={styles.rollingCard}
            style={{ border: `1px solid ${benchLoading ? 'var(--border)' : 'rgba(59,130,246,0.15)'}` }}
          >
            <div className={styles.rollingCardHeader}>{label} RETURN</div>
            <RollingPortfolioRow value={pRet} />
            {benchLoading ? (
              <RollingLoadingHint />
            ) : (
              activeBenchSeries.map(benchmark => {
                const bRet = getBenchmarkPointReturn(benchmark, targetFromMonth, lastMonth);
                const alpha = pRet != null && bRet != null ? pRet - bRet : null;
                return <RollingBenchmarkRow key={benchmark.key} benchmark={benchmark} value={bRet} alpha={alpha} />;
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
