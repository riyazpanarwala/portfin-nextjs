import { BENCHMARKS } from '@/lib/niftyData';
import { fmt, colorPnl } from '@/lib/store';

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

export function calculatePointReturn(start, end) {
  return start != null && end != null && start > 0
    ? ((end / start) - 1) * 100
    : null;
}

export function getReturnColor(value, fallback = 'var(--text3)') {
  return value == null ? fallback : colorPnl(value);
}

export function getShortBenchmarkLabel(bench) {
  return bench.label.split(' ').slice(0, 2).join(' ');
}

export function subtractMonths(monthStr, n) {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1 - n, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function exportComparisonCSV(rebasedPortfolio, rebasedBenchSeries, activeBenchSeries) {
  const benchMaps = rebasedBenchSeries.map(b => mapByMonth(b.data, 'indexed'));
  const headers = [
    'Month',
    'Portfolio (indexed)',
    ...activeBenchSeries.map(b => `${b.label} (indexed)`),
  ];
  const rows = rebasedPortfolio.map(d => [
    d.month,
    d.indexed?.toFixed(2) ?? '',
    ...rebasedBenchSeries.map((b, i) => {
      const value = benchMaps[i][d.month];
      return value != null ? value.toFixed(2) : '';
    }),
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const link = document.createElement('a');
  link.href = 'data:text/csv,' + encodeURIComponent(csv);
  link.download = 'portfolio_vs_benchmarks.csv';
  link.click();
}
