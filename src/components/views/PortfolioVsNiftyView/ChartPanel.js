import {
  AbsoluteChart,
  CagrTrendChart,
  ComparisonChart,
  DrawdownChart,
} from '@/components/charts/Charts';
import styles from '../PortfolioVsNiftyView.module.css';
import { CHART_MODES } from './helpers';

function ModeButton({ label, value, active, onClick }) {
  return (
    <button
      onClick={() => onClick(value)}
      style={{
        padding:      '4px 12px',
        borderRadius: '6px',
        fontSize:     '11px',
        fontWeight:   '600',
        cursor:       'pointer',
        background:   active ? 'rgba(59,130,246,0.2)' : 'transparent',
        border:       `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color:        active ? 'var(--accent2)' : 'var(--text3)',
      }}
    >
      {label}
    </button>
  );
}

function getChartTitle(mode) {
  if (mode === 'cagr') return 'Sub-portfolio CAGR trend';
  if (mode === 'drawdown') return 'Drawdown analysis';
  return 'Portfolio vs benchmarks';
}

function getChartSubtitle(mode) {
  if (mode === 'cagr') return 'MF and stock CAGR captured in each saved snapshot';
  if (mode === 'drawdown') return 'Peak-to-trough decline at each month — shallower is better';
  if (mode === 'absolute') return 'Raw portfolio value and invested capital over time';
  return 'Indexed to 100 at first snapshot — shows relative performance';
}

function ChartHeader({ mode, onModeChange, showExport, onExport, benchLoading }) {
  const showBenchmarkWarning = (mode === 'indexed' || mode === 'drawdown') && benchLoading;

  return (
    <div className={styles.chartHeader}>
      <div>
        <div className={styles.chartTitle}>{getChartTitle(mode)}</div>
        <div className={styles.chartSubtitle}>
          {getChartSubtitle(mode)}
          {showBenchmarkWarning && (
            <span className={styles.chartSubtitleWarning}>
              {' '}(benchmark lines use static data while live fetch completes)
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showExport && (
          <button
            onClick={onExport}
            className="btn btn-ghost"
            style={{ padding: '4px 10px', fontSize: 11, gap: 5 }}
            title="Export indexed comparison series as CSV"
          >
            ↓ CSV
          </button>
        )}
        <div className={styles.chartModeGroup}>
          {CHART_MODES.map(([value, label]) => (
            <ModeButton
              key={value}
              value={value}
              label={label}
              active={mode === value}
              onClick={onModeChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChartPanel({
  mode,
  onModeChange,
  onExport,
  benchLoading,
  portfolioSeries,
  rebasedPortfolio,
  rebasedBenchSeries,
}) {
  const chartBenchSeries = rebasedBenchSeries.map(benchmark => ({
    ...benchmark,
    color: benchmark.hexColor,
  }));

  return (
    <div className={`glass ${styles.chartPanel}`}>
      <ChartHeader
        mode={mode}
        onModeChange={onModeChange}
        showExport={mode === 'indexed' && rebasedPortfolio.length > 0}
        onExport={onExport}
        benchLoading={benchLoading}
      />

      {mode === 'indexed' && (
        <ComparisonChart
          portfolioSeries={rebasedPortfolio}
          benchmarkSeries={chartBenchSeries}
        />
      )}
      {mode === 'absolute' && <AbsoluteChart portfolioSeries={portfolioSeries} />}
      {mode === 'cagr'     && <CagrTrendChart series={portfolioSeries} />}
      {mode === 'drawdown' && (
        <DrawdownChart
          portfolioSeries={rebasedPortfolio}
          benchmarkSeries={chartBenchSeries}
        />
      )}
    </div>
  );
}
