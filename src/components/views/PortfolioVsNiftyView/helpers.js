import { BENCHMARKS } from '@/lib/niftyData';
import { fmt, colorPnl } from '@/lib/store';
import {
  calculatePointReturn,
  getShortBenchmarkLabel,
  subtractMonths,
} from '@/hooks/useBenchmarkSeries';

export {
  calculatePointReturn,
  getShortBenchmarkLabel,
  subtractMonths,
};

export const BENCH_KEYS = Object.keys(BENCHMARKS);

export const ROLLING_PERIODS = [
  { label: '6M',  months: 6,    periodKey: '6m'  },
  { label: '1Y',  months: 12,   periodKey: '1y'  },
  { label: '2Y',  months: 24,   periodKey: '2y'  },
  { label: '3Y',  months: 36,   periodKey: '3y'  },
  { label: 'Max', months: null, periodKey: 'max' },
];

export const CHART_MODES = [
  ['indexed',  'Indexed'],
  ['absolute', 'Absolute'],
  ['cagr',     'CAGR'],
  ['drawdown', 'Drawdown'],
];

export function formatReturn(value, decimals = 1) {
  return value != null ? `${value > 0 ? '+' : ''}${fmt(value, decimals)}%` : '—';
}

export function formatPositiveReturn(value, decimals = 1) {
  return `${value >= 0 ? '+' : ''}${fmt(value, decimals)}%`;
}

export function formatSignedMagnitude(value, decimals = 1) {
  return `${value > 0 ? '+' : ''}${fmt(value, decimals)}%`;
}

export function mapByMonth(series, valueKey = 'value') {
  return Object.fromEntries(series.map(d => [d.month, d[valueKey]]));
}

export function closestMonthAtOrBefore(months, targetMonth, fallback = null) {
  const candidates = months.filter(m => m <= targetMonth);
  return candidates.length ? candidates[candidates.length - 1] : fallback;
}

export function getReturnColor(value, fallback = 'var(--text3)') {
  return value == null ? fallback : colorPnl(value);
}
