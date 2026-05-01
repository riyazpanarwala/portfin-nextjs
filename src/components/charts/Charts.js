'use client';

import { useEffect, useRef, useMemo } from 'react';

// ─── Chart.js loader (lazy, singleton) ────────────────────────────────────────
let _chartjs = null;
async function getChartJS() {
  if (_chartjs) return _chartjs;
  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);
  // Global defaults matching the dark theme
  Chart.defaults.color = '#5c7a9a';
  Chart.defaults.borderColor = 'rgba(45,64,96,0.5)';
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 10;
  _chartjs = Chart;
  return _chartjs;
}

// ─── useChart hook ─────────────────────────────────────────────────────────────
function useChart(buildConfig, deps) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getChartJS().then(Chart => {
      if (cancelled || !canvasRef.current) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const config = buildConfig(Chart);
      if (!config) return;
      chartRef.current = new Chart(canvasRef.current, config);
    });
    return () => {
      cancelled = true;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return canvasRef;
}

// ─── Donut / Pie chart ─────────────────────────────────────────────────────────
export function DonutChart({ data, size = 140, innerRadius = 0.55, showLegend = true }) {
  const canvasRef = useChart(() => {
    if (!data || !data.length) return null;
    return {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data:            data.map(d => d.value),
          backgroundColor: data.map(d => d.color),
          borderColor:     data.map(d => d.color),
          borderWidth:     2,
          hoverOffset:     6,
        }],
      },
      options: {
        cutout:     `${innerRadius * 100}%`,
        responsive: false,
        animation:  { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const d = data[ctx.dataIndex];
                return ` ${d.label}: ${d.pct ? d.pct.toFixed(1) + '%' : ''}`;
              },
            },
          },
        },
      },
    };
  }, [JSON.stringify(data)]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <canvas ref={canvasRef} width={size} height={size} />
        {/* Centre label */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{data.length}</div>
          <div style={{ fontSize: 9, color: 'var(--text3)' }}>ASSETS</div>
        </div>
      </div>
      {showLegend && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>{d.label}</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600 }}>
                {d.pct ? d.pct.toFixed(1) + '%' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sparkline ─────────────────────────────────────────────────────────────────
export function Sparkline({ data, width = 120, height = 36, color = '#3b82f6' }) {
  const canvasRef = useChart(() => {
    if (!data || data.length < 2) return null;
    const positive = data[data.length - 1] >= data[0];
    const lineColor = color === 'var(--accent)' ? '#3b82f6' : color;
    return {
      type: 'line',
      data: {
        labels:   data.map((_, i) => i),
        datasets: [{
          data,
          borderColor:     lineColor,
          borderWidth:     1.5,
          fill:            true,
          backgroundColor: lineColor + '33',
          tension:         0.4,
          pointRadius:     0,
          pointHoverRadius:0,
        }],
      },
      options: {
        responsive: false,
        animation:  false,
        plugins:    { legend: { display: false }, tooltip: { enabled: false } },
        scales:     { x: { display: false }, y: { display: false } },
        elements:   { line: { borderCapStyle: 'round' } },
      },
    };
  }, [JSON.stringify(data), color]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />;
}

// ─── Bar chart ─────────────────────────────────────────────────────────────────
export function BarChart({ data, width = 300, height = 120, color = '#3b82f6' }) {
  const canvasRef = useChart(() => {
    if (!data || !data.length) return null;
    return {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data:            data.map(d => d.value),
          backgroundColor: data.map(d => d.color || color + 'cc'),
          borderColor:     data.map(d => d.color || color),
          borderWidth:     1,
          borderRadius:    3,
        }],
      },
      options: {
        responsive: false,
        animation:  { duration: 600 },
        plugins:    { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => ` ₹${(ctx.parsed.y / 100000).toFixed(1)}L` },
        }},
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { grid: { color: 'rgba(45,64,96,0.4)' }, ticks: {
            font: { size: 9 },
            callback: v => `₹${(v/100000).toFixed(0)}L`,
          }},
        },
      },
    };
  }, [JSON.stringify(data), color]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />;
}

// ─── Line chart ────────────────────────────────────────────────────────────────
export function LineChart({ data, width = 300, height = 120, color = '#3b82f6', xKey = 'x', yKey = 'y' }) {
  const canvasRef = useChart(() => {
    if (!data || data.length < 2) return null;
    return {
      type: 'line',
      data: {
        labels: data.map(d => d[xKey]),
        datasets: [{
          data:            data.map(d => d[yKey]),
          borderColor:     color,
          borderWidth:     2,
          fill:            true,
          backgroundColor: color + '22',
          tension:         0.4,
          pointRadius:     3,
          pointBackgroundColor: color,
          pointBorderColor: 'var(--bg)',
          pointBorderWidth: 1.5,
        }],
      },
      options: {
        responsive: false,
        animation:  { duration: 600 },
        plugins:    { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { grid: { color: 'rgba(45,64,96,0.4)' }, ticks: {
            font: { size: 9 },
            callback: v => `₹${(v/100000).toFixed(0)}L`,
          }},
        },
      },
    };
  }, [JSON.stringify(data), color, xKey, yKey]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />;
}

// ─── Horizontal bar ────────────────────────────────────────────────────────────
export function HBar({ value, max, color, label, sub }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{sub}</span>
      </div>
      <div style={{ height: '5px', background: 'var(--bg3)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

// ─── Cumulative flow chart (Timeline) ──────────────────────────────────────────
export function CumChart({ data }) {
  const canvasRef = useChart(() => {
    if (!data || data.length < 2) return null;
    return {
      type: 'line',
      data: {
        labels: data.map(d => d.month),
        datasets: [{
          label:           'Cumulative Invested',
          data:            data.map(d => d.cum),
          borderColor:     '#3b82f6',
          borderWidth:     2,
          fill:            true,
          backgroundColor: 'rgba(59,130,246,0.15)',
          tension:         0.4,
          pointRadius:     0,
          pointHoverRadius:4,
          pointBackgroundColor: '#60a5fa',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ` ₹${(ctx.parsed.y / 100000).toFixed(2)}L` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 9 } } },
          y: { grid: { color: 'rgba(45,64,96,0.4)' }, ticks: {
            font: { size: 9 },
            callback: v => `₹${(v/100000).toFixed(1)}L`,
          }},
        },
      },
    };
  }, [JSON.stringify(data)]);

  if (!data || data.length < 2) return <div style={{ color: 'var(--text3)', fontSize: 12 }}>Not enough data</div>;
  return <div style={{ height: 120, position: 'relative' }}><canvas ref={canvasRef} /></div>;
}

// ─── Holding Performance Chart (MF / Stocks detail panel) ─────────────────────
export function HoldingPerformanceChart({ lots, cmp }) {
  const canvasRef = useChart(() => {
    if (!lots || lots.length === 0 || !cmp) return null;

    // Build cumulative monthly series
    const monthly = {};
    [...lots].sort((a, b) => a.date.localeCompare(b.date)).forEach(lot => {
      const m = lot.date.slice(0, 7);
      if (!monthly[m]) monthly[m] = { qty: 0, invested: 0 };
      monthly[m].qty      += lot.qty;
      monthly[m].invested += lot.qty * lot.price;
    });

    let cumQty = 0, cumInv = 0;
    const points = Object.entries(monthly).sort().map(([month, row]) => {
      cumQty += row.qty; cumInv += row.invested;
      return { month, invested: cumInv, value: cumQty * cmp };
    });

    if (points.length < 1) return null;
    // Prepend a zero-baseline point
    const series = [{ month: 'Start', invested: 0, value: 0 }, ...points];

    return {
      type: 'line',
      data: {
        labels: series.map(p => p.month),
        datasets: [
          {
            label:           'Market Value',
            data:            series.map(p => p.value),
            borderColor:     '#3b82f6',
            borderWidth:     2.5,
            fill:            true,
            backgroundColor: 'rgba(59,130,246,0.12)',
            tension:         0.4,
            pointRadius:     (ctx) => ctx.dataIndex === series.length - 1 ? 5 : 2,
            pointBackgroundColor: '#60a5fa',
            pointBorderColor: '#0b0f1a',
            pointBorderWidth: 1.5,
          },
          {
            label:           'Invested',
            data:            series.map(p => p.invested),
            borderColor:     'rgba(148,169,196,0.6)',
            borderWidth:     1.5,
            borderDash:      [5, 4],
            fill:            false,
            tension:         0.4,
            pointRadius:     0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: { font: { size: 10 }, color: '#94a9c4', boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ₹${(ctx.parsed.y / 100000).toFixed(2)}L`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 9 } } },
          y: { grid: { color: 'rgba(45,64,96,0.4)' }, ticks: {
            font: { size: 9 },
            callback: v => `₹${(v/100000).toFixed(1)}L`,
          }},
        },
      },
    };
  }, [JSON.stringify(lots), cmp]);

  if (!lots || !lots.length || !cmp) return <div style={{ color: 'var(--text3)', fontSize: 12 }}>No chart data</div>;
  return <div style={{ height: 190, position: 'relative' }}><canvas ref={canvasRef} /></div>;
}

// ─── Waterfall chart (WaterfallView) ──────────────────────────────────────────
export function WaterfallChart({ steps }) {
  const canvasRef = useChart(() => {
    if (!steps || !steps.length) return null;

    const labels = steps.map(s => s.label);
    const resolveColor = (cssVar) => {
      const map = {
        'var(--teal)':   '#14b8a6',
        'var(--purple)': '#8b5cf6',
        'var(--green2)': '#34d399',
        'var(--red2)':   '#f87171',
        'var(--accent2)':'#60a5fa',
      };
      return map[cssVar] || '#60a5fa';
    };

    // Build floating bar data: [base, top]
    let running = 0;
    const floatData = steps.map(s => {
      if (s.isTotal) return { base: 0, top: s.value, color: resolveColor(s.color) };
      const base = running;
      running += s.value;
      return { base, top: running, color: resolveColor(s.color) };
    });

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data:            floatData.map(d => [d.base, d.top]),
          backgroundColor: floatData.map(d => d.color + 'cc'),
          borderColor:     floatData.map(d => d.color),
          borderWidth:     1,
          borderRadius:    4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
						const custom = ctx.parsed._custom;

						const base = Array.isArray(custom)
						  ? custom[0]
						  : custom?.start ?? 0;

						const top = Array.isArray(custom)
						  ? custom[1]
						  : custom?.end ?? ctx.parsed.y;
                const val = top - base;
                return ` ₹${(Math.abs(val) / 100000).toFixed(2)}L`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: 'rgba(45,64,96,0.4)' }, ticks: {
            font: { size: 9 },
            callback: v => `₹${(v / 100000).toFixed(0)}L`,
          }},
        },
      },
    };
  }, [JSON.stringify(steps)]);

  if (!steps || !steps.length) return null;
  return <div style={{ height: 220, position: 'relative' }}><canvas ref={canvasRef} /></div>;
}

// ─── Wealth projection chart (GoalView) ───────────────────────────────────────
export function WealthProjectionChart({ data, stepData, goal }) {
  const canvasRef = useChart(() => {
    if (!data || data.length < 2) return null;
    return {
      type: 'line',
      data: {
        labels: data.map(d => `Y${d.year}`),
        datasets: [
          {
            label:           'Flat SIP',
            data:            data.map(d => d.corpus),
            borderColor:     '#3b82f6',
            borderWidth:     2,
            fill:            true,
            backgroundColor: 'rgba(59,130,246,0.12)',
            tension:         0.4,
            pointRadius:     0,
          },
          {
            label:           'Step-Up SIP',
            data:            stepData.map(d => d.corpus),
            borderColor:     '#34d399',
            borderWidth:     2,
            fill:            false,
            tension:         0.4,
            pointRadius:     0,
          },
          {
            label:           'Total Invested',
            data:            data.map(d => d.invested),
            borderColor:     'rgba(148,169,196,0.55)',
            borderWidth:     1.5,
            borderDash:      [5, 4],
            fill:            false,
            tension:         0.4,
            pointRadius:     0,
          },
          {
            label:           'Goal',
            data:            data.map(() => goal),
            borderColor:     '#f87171',
            borderWidth:     1.5,
            borderDash:      [6, 4],
            fill:            false,
            pointRadius:     0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: { font: { size: 10 }, color: '#94a9c4', boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ₹${(ctx.parsed.y / 10000000).toFixed(2)}Cr`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
          y: { grid: { color: 'rgba(45,64,96,0.4)' }, ticks: {
            font: { size: 9 },
            callback: v => v >= 1e7 ? `₹${(v/1e7).toFixed(1)}Cr` : `₹${(v/1e5).toFixed(0)}L`,
          }},
        },
      },
    };
  }, [JSON.stringify(data), JSON.stringify(stepData), goal]);

  return <div style={{ height: 220, position: 'relative' }}><canvas ref={canvasRef} /></div>;
}

// ─── Portfolio vs Nifty comparison chart ──────────────────────────────────────
export function ComparisonChart({ portfolioSeries, niftySeries }) {
  const canvasRef = useChart(() => {
    if (!portfolioSeries.length || !niftySeries.length) return null;
    return {
      type: 'line',
      data: {
        labels: portfolioSeries.map(d => d.month),
        datasets: [
          {
            label:           'Your Portfolio',
            data:            portfolioSeries.map(d => d.indexed),
            borderColor:     '#3b82f6',
            borderWidth:     2.5,
            fill:            true,
            backgroundColor: 'rgba(59,130,246,0.1)',
            tension:         0.4,
            pointRadius:     (ctx) => ctx.dataIndex === portfolioSeries.length - 1 ? 5 : 0,
            pointBackgroundColor: '#60a5fa',
            pointBorderColor: '#0b0f1a',
            pointBorderWidth: 1.5,
          },
          {
            label:           'Nifty 50',
            data:            niftySeries.map(d => d.indexed),
            borderColor:     '#f59e0b',
            borderWidth:     2,
            borderDash:      [6, 3],
            fill:            false,
            tension:         0.4,
            pointRadius:     (ctx) => ctx.dataIndex === niftySeries.length - 1 ? 5 : 0,
            pointBackgroundColor: '#f59e0b',
            pointBorderColor: '#0b0f1a',
            pointBorderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: { font: { size: 10 }, color: '#94a9c4', boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
          y: {
            grid: { color: 'rgba(45,64,96,0.4)' },
            ticks: { font: { size: 9 }, callback: v => v.toFixed(0) },
          },
        },
      },
    };
  }, [JSON.stringify(portfolioSeries), JSON.stringify(niftySeries)]);

  if (!portfolioSeries.length) return null;
  return <div style={{ height: 260, position: 'relative' }}><canvas ref={canvasRef} /></div>;
}

// ─── Absolute portfolio value chart (vs-nifty view) ───────────────────────────
export function AbsoluteChart({ portfolioSeries }) {
  const canvasRef = useChart(() => {
    if (!portfolioSeries.length) return null;
    return {
      type: 'line',
      data: {
        labels: portfolioSeries.map(d => d.month),
        datasets: [
          {
            label:           'Portfolio Value',
            data:            portfolioSeries.map(d => d.value),
            borderColor:     '#3b82f6',
            borderWidth:     2.5,
            fill:            true,
            backgroundColor: 'rgba(59,130,246,0.12)',
            tension:         0.4,
            pointRadius:     0,
            pointHoverRadius:4,
          },
          {
            label:           'Total Invested',
            data:            portfolioSeries.map(d => d.invested),
            borderColor:     'rgba(148,169,196,0.55)',
            borderWidth:     1.5,
            borderDash:      [5, 3],
            fill:            false,
            tension:         0.4,
            pointRadius:     0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: { font: { size: 10 }, color: '#94a9c4', boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ₹${(ctx.parsed.y/100000).toFixed(2)}L`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 9 } } },
          y: { grid: { color: 'rgba(45,64,96,0.4)' }, ticks: {
            font: { size: 9 },
            callback: v => `₹${(v/100000).toFixed(0)}L`,
          }},
        },
      },
    };
  }, [JSON.stringify(portfolioSeries)]);

  if (!portfolioSeries.length) return null;
  return <div style={{ height: 260, position: 'relative' }}><canvas ref={canvasRef} /></div>;
}
