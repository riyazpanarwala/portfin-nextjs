import { dayKey, isVerifiedSnapshot } from './financialRules.js';
import { decimal } from './financialDecimal.js';

/** Return the valuation day, falling back to the save day for legacy snapshots. */
export const drawdownDate = snapshot => dayKey(snapshot.valuationAt || snapshot.snapshotAt);

/** Select the latest usable save per valuation day, optionally requiring verification. */
export function drawdownHistory(snapshots = [], verifiedOnly = false) {
  // Keep the last saved checkpoint for each day so chart dates are unambiguous.
  const days = new Map();
  for (const snapshot of [...snapshots].sort((a, b) => String(a.snapshotAt).localeCompare(String(b.snapshotAt)))) {
    const date = drawdownDate(snapshot);
    const value = Number(snapshot.totalValue);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || snapshot.totalValue == null || !Number.isFinite(value) || value < 0 || (verifiedOnly && !isVerifiedSnapshot(snapshot))) continue;
    days.set(date, snapshot);
  }
  return [...days.values()].sort((a, b) => drawdownDate(a).localeCompare(drawdownDate(b)));
}

/**
 * Estimate drawdown by chaining Modified Dietz returns between daily valuations.
 * Holdings exclude cash: purchases are inflows and net sale proceeds are outflows,
 * including when proceeds are later reinvested. Date-only trades use midpoint-of-day
 * weights, as in portfolioChanges. Exact TWR would require values at every cash flow.
 * Returns null for insufficient history or an error when returns cannot be estimated.
 */
export function analyzeDrawdown(snapshots, trades = []) {
  const history = drawdownHistory(snapshots);
  const series = [];
  let index = 100;
  for (let i = 0; i < history.length; i++) {
    const current = history[i], date = drawdownDate(current);
    if (i) {
      const previous = history[i - 1], start = drawdownDate(previous);
      const duration = Date.parse(date) - Date.parse(start);
      let netFlow = decimal(0), capital = decimal(previous.totalValue);
      let hasTrades = false;
      for (const trade of trades) {
        const tradeDate = dayKey(trade.tradeDate);
        if (tradeDate <= start || tradeDate > date) continue;
        hasTrades = true;
        const quantity = Number(trade.quantity), price = Number(trade.price), fees = Number(trade.brokerage || 0);
        if (!Number.isFinite(Date.parse(tradeDate)) || !['BUY', 'SELL'].includes(trade.tradeType) ||
            !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(fees) || fees < 0) {
          return { error: 'Trade history needs reconciliation before drawdown can be calculated.' };
        }
        const gross = decimal(trade.quantity).times(trade.price);
        const flow = trade.tradeType === 'BUY' ? gross.plus(fees) : gross.minus(fees).negated();
        const weight = Math.max(0, Math.min(1, (Date.parse(date) - Date.parse(tradeDate) + 432e5) / duration));
        netFlow = netFlow.plus(flow);
        capital = capital.plus(flow.times(weight));
      }
      const gain = decimal(current.totalValue).minus(previous.totalValue).minus(netFlow);
      // Only genuinely empty intervals can carry forward without a denominator.
      // Offsetting gains/losses can have zero net gain but nonpositive capital.
      const emptyInterval = !hasTrades && decimal(previous.totalValue).isZero() && decimal(current.totalValue).isZero();
      if (capital.lte(0) && !emptyInterval) return { error: `Cannot estimate drawdown for ${start} to ${date}: insufficient invested capital. Rebuild more frequent checkpoints.` };
      const factor = capital.gt(0) ? decimal(1).plus(gain.div(capital)).toNumber() : 1;
      if (!Number.isFinite(factor) || factor < 0 || (index === 0 && Number(current.totalValue) > 0)) {
        return { error: `Cannot link investment returns for ${start} to ${date}. Rebuild more frequent checkpoints.` };
      }
      index *= factor;
    }
    series.push({ date, value: index, portfolioValue: Number(current.totalValue) });
  }
  if (series.length < 2) return null;
  let peak = series[0].value, peakDate = series[0].date;
  let maxDrawdown = 0, maxDrawdownDate = null, maxDrawdownPeakDate = null;
  let drawdownStart = null;
  const recoveries = [], drawdownSeries = [];
  for (const point of series) {
    if (point.value >= peak) {
      if (drawdownStart) {
        recoveries.push({ start: drawdownStart, end: point.date, days: Math.round((Date.parse(point.date) - Date.parse(drawdownStart)) / 864e5) });
        drawdownStart = null;
      }
      peak = point.value;
      peakDate = point.date;
    }
    const drawdown = ((point.value - peak) / peak) * 100;
    if (drawdown < 0 && !drawdownStart) drawdownStart = point.date;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDate = point.date;
      maxDrawdownPeakDate = peakDate;
    }
    drawdownSeries.push({ ...point, drawdown, peak, peakDate });
  }
  const last = drawdownSeries.at(-1);
  const currentDrawdownDays = drawdownStart ? Math.max(1, Math.round((Date.parse(last.date) - Date.parse(drawdownStart)) / 864e5)) : null;
  const avgRecovery = recoveries.length ? Math.round(recoveries.reduce((sum, period) => sum + period.days, 0) / recoveries.length) : null;
  return { drawdownSeries, maxDrawdown, maxDrawdownDate, maxDrawdownPeakDate,
    currentDrawdown: last.drawdown, currentVal: last.value, allTimePeak: peak, allTimePeakDate: peakDate,
    gapFromATH: last.drawdown, recoveries, avgRecovery, currentDrawdownDays,
    recoveryDays: currentDrawdownDays ?? avgRecovery };
}
