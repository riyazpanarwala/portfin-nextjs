import { isVerifiedSnapshot } from './financialRules.js';

export function drawdownHistory(snapshots = [], verifiedOnly = false) {
  // Keep the last saved checkpoint for each day so chart dates are unambiguous.
  const days = new Map();
  for (const snapshot of [...snapshots].sort((a, b) => String(a.snapshotAt).localeCompare(String(b.snapshotAt)))) {
    const date = String(snapshot.snapshotAt).slice(0, 10);
    const value = Number(snapshot.totalValue);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || !Number.isFinite(value) || value <= 0 || (verifiedOnly && !isVerifiedSnapshot(snapshot))) continue;
    days.set(date, snapshot);
  }
  return [...days.values()];
}

export function analyzeDrawdown(snapshots) {
  const series = drawdownHistory(snapshots).map(s => ({ date: s.snapshotAt.slice(0, 10), value: Number(s.totalValue) }));
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
