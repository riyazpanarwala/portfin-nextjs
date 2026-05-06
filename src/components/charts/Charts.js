'use client';

import {
  LineChart as ReLineChart,
  BarChart as ReBarChart,
  AreaChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── CSS var → hex (Recharts needs real colours) ──────────────────────────────
const CSS_VAR_MAP = {
  'var(--accent)':  '#3b82f6',
  'var(--accent2)': '#60a5fa',
  'var(--green)':   '#10b981',
  'var(--green2)':  '#34d399',
  'var(--red)':     '#ef4444',
  'var(--red2)':    '#f87171',
  'var(--yellow)':  '#f59e0b',
  'var(--purple)':  '#8b5cf6',
  'var(--teal)':    '#14b8a6',
  'var(--text)':    '#e8eef8',
  'var(--text2)':   '#94a9c4',
  'var(--text3)':   '#5c7a9a',
};
function resolveColor(c, fallback = '#3b82f6') {
  if (!c) return fallback;
  return CSS_VAR_MAP[c] || (c.startsWith('var(') ? fallback : c);
}

// ─── Smart Y-axis formatter ───────────────────────────────────────────────────
function yFmt(v, maxVal) {
  if (maxVal >= 1e7)  return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (maxVal >= 1e5)  return `₹${(v / 1e5).toFixed(1)}L`;
  if (maxVal >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${Number(v).toFixed(0)}`;
}

const CHART_STYLE = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
};

const GRID_COLOR   = 'rgba(45,64,96,0.4)';
const TICK_COLOR   = '#5c7a9a';
const TOOLTIP_STYLE = {
  background: '#111827',
  border: '1px solid #2d4060',
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#e8eef8',
};

// ─── DonutChart ───────────────────────────────────────────────────────────────
// Pure SVG — Recharts PieChart has awkward inner-label support, so we keep the
// existing SVG arc approach but drop the Chart.js dependency entirely.

export function DonutChart({ data, size = 140, innerRadius = 0.55, showLegend = true }) {
  if (!data || !data.length) return null;

  const cx = size / 2, cy = size / 2;
  const r  = (size / 2) * 0.88;
  const ir = r * innerRadius;

  function arcPath(startA, endA) {
    const x1o = cx + r  * Math.cos(startA), y1o = cy + r  * Math.sin(startA);
    const x2o = cx + r  * Math.cos(endA),   y2o = cy + r  * Math.sin(endA);
    const x1i = cx + ir * Math.cos(endA),   y1i = cy + ir * Math.sin(endA);
    const x2i = cx + ir * Math.cos(startA), y2i = cy + ir * Math.sin(startA);
    const lg  = endA - startA > Math.PI ? 1 : 0;
    return `M${x1o},${y1o} A${r},${r},0,${lg},1,${x2o},${y2o} L${x1i},${y1i} A${ir},${ir},0,${lg},0,${x2i},${y2i} Z`;
  }

  let angle = -Math.PI / 2;
  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = data.map(d => {
    const start = angle;
    const sweep = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    angle += sweep;
    return { ...d, path: arcPath(start, start + sweep) };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} opacity={0.9} />
          ))}
          <text x={cx} y={cy - 7}  textAnchor="middle" fill="#e8eef8" fontSize={14} fontWeight={700} fontFamily="var(--font-mono)">{data.length}</text>
          <text x={cx} y={cy + 8}  textAnchor="middle" fill="#5c7a9a" fontSize={9}>ASSETS</text>
        </svg>
      </div>
      {showLegend && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

// ─── Sparkline ────────────────────────────────────────────────────────────────
export function Sparkline({ data, width = 120, height = 36, color = '#3b82f6' }) {
  if (!data || data.length < 2) return null;
  const c = resolveColor(color, '#3b82f6');
  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${c.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
            <stop offset="95%" stopColor={c} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={c}
          strokeWidth={1.5}
          fill={`url(#spark-${c.replace('#', '')})`}
          dot={false}
          isAnimationActive={false}
        />
        <XAxis dataKey="i" hide />
        <YAxis hide />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── BarChart ─────────────────────────────────────────────────────────────────
export function BarChart({ data, width = 300, height = 120, color = '#3b82f6' }) {
  if (!data || !data.length) return null;
  const resolvedColor = resolveColor(color, '#3b82f6');
  const maxVal = Math.max(...data.map(d => d.value), 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => yFmt(v, maxVal)} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={v => yFmt(v, maxVal)}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(59,130,246,0.08)' }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {data.map((d, i) => (
            <Cell key={i} fill={resolveColor(d.color, resolvedColor)} fillOpacity={0.85} />
          ))}
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  );
}

// ─── LineChart ────────────────────────────────────────────────────────────────
export function LineChart({ data, width = 300, height = 120, color = '#3b82f6', xKey = 'x', yKey = 'y' }) {
  if (!data || data.length < 2) return null;
  const c = resolveColor(color, '#3b82f6');
  const maxVal = Math.max(...data.map(d => d[yKey]), 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReLineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <defs>
          <linearGradient id={`line-fill-${c.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={c} stopOpacity={0.18} />
            <stop offset="95%" stopColor={c} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey={xKey} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => yFmt(v, maxVal)} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={v => yFmt(v, maxVal)}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ stroke: c, strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={c}
          strokeWidth={2}
          dot={{ fill: c, stroke: '#0b0f1a', strokeWidth: 1.5, r: 3 }}
          activeDot={{ r: 5 }}
        />
      </ReLineChart>
    </ResponsiveContainer>
  );
}

// ─── HBar (horizontal progress bar) ──────────────────────────────────────────
// Pure CSS — no chart lib needed.
export function HBar({ value, max, color, label, sub }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{sub}</span>
      </div>
      <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

// ─── CumChart (cumulative investment flow) ────────────────────────────────────
export function CumChart({ data }) {
  if (!data || data.length < 2) return <div style={{ color: 'var(--text3)', fontSize: 12 }}>Not enough data</div>;

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <defs>
          <linearGradient id="cum-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={v => v?.slice(5)} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={v => `₹${(v / 100000).toFixed(2)}L`}
          labelFormatter={l => l}
          contentStyle={TOOLTIP_STYLE}
        />
        <Area type="monotone" dataKey="cum" stroke="#3b82f6" strokeWidth={2} fill="url(#cum-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── HoldingPerformanceChart ──────────────────────────────────────────────────
export function HoldingPerformanceChart({ lots, cmp }) {
  if (!lots || !lots.length || !cmp) return <div style={{ color: 'var(--text3)', fontSize: 12 }}>No chart data</div>;

  const monthly = {};
  [...lots].sort((a, b) => a.date.localeCompare(b.date)).forEach(lot => {
    const m = lot.date.slice(0, 7);
    if (!monthly[m]) monthly[m] = { qty: 0, invested: 0 };
    monthly[m].qty      += lot.qty;
    monthly[m].invested += lot.qty * lot.price;
  });

  let cumQty = 0, cumInv = 0;
  const series = [{ month: 'Start', value: 0, invested: 0 }];
  Object.entries(monthly).sort().forEach(([month, row]) => {
    cumQty += row.qty;
    cumInv += row.invested;
    series.push({ month, value: cumQty * cmp, invested: cumInv });
  });

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ReLineChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <defs>
          <linearGradient id="hp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(v, name) => [`₹${(v / 100000).toFixed(2)}L`, name]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Line type="monotone" dataKey="value"    name="Market Value" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="invested" name="Invested"     stroke="rgba(148,169,196,0.6)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
      </ReLineChart>
    </ResponsiveContainer>
  );
}

// ─── WaterfallChart ───────────────────────────────────────────────────────────
// Recharts doesn't have a native waterfall; we build it with stacked BarChart
// using a transparent "spacer" bar + a visible "value" bar.

const CSS_VAR_COLORS = {
  'var(--teal)':   '#14b8a6',
  'var(--purple)': '#8b5cf6',
  'var(--green2)': '#34d399',
  'var(--red2)':   '#f87171',
  'var(--accent2)':'#60a5fa',
};
function resolveWaterfallColor(c) {
  return CSS_VAR_COLORS[c] || c || '#60a5fa';
}

export function WaterfallChart({ steps }) {
  if (!steps || !steps.length) return null;

  let running = 0;
  const chartData = steps.map(s => {
    if (s.isTotal) {
      return { label: s.label, spacer: 0, bar: s.value, color: resolveWaterfallColor(s.color) };
    }
    const base = running;
    running += s.value;
    return {
      label: s.label,
      spacer: Math.min(base, base + s.value),
      bar:    Math.abs(s.value),
      color:  resolveWaterfallColor(s.color),
    };
  });

  const maxVal = Math.max(...chartData.map(d => d.spacer + d.bar), 1);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ReBarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={{ fill: TICK_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`}
          tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52}
        />
        <Tooltip
          formatter={(v, name) => name === 'bar' ? [`₹${(v / 100000).toFixed(2)}L`] : null}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(59,130,246,0.06)' }}
        />
        {/* Invisible spacer */}
        <Bar dataKey="spacer" stackId="wf" fill="transparent" legendType="none" />
        {/* Visible value bar */}
        <Bar dataKey="bar" stackId="wf" radius={[4, 4, 0, 0]} maxBarSize={60}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  );
}

// ─── WealthProjectionChart ────────────────────────────────────────────────────
export function WealthProjectionChart({ data, stepData, goal }) {
  if (!data || data.length < 2) return null;

  const merged = data.map((d, i) => ({
    year:     `Y${d.year}`,
    flatSIP:  d.corpus,
    stepUp:   stepData[i]?.corpus ?? d.corpus,
    invested: d.invested,
    goal:     goal,
  }));

  const maxVal = Math.max(...merged.map(d => Math.max(d.flatSIP, d.stepUp, d.goal)), 1);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ReLineChart data={merged} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <defs>
          <linearGradient id="wp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="year" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.floor(merged.length / 10)} />
        <YAxis tickFormatter={v => v >= 1e7 ? `₹${(v / 1e7).toFixed(1)}Cr` : `₹${(v / 1e5).toFixed(0)}L`}
          tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={58} />
        <Tooltip
          formatter={(v, name) => [`₹${v >= 1e7 ? (v / 1e7).toFixed(2) + 'Cr' : (v / 1e5).toFixed(2) + 'L'}`, name]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Line type="monotone" dataKey="flatSIP"  name="Flat SIP"      stroke="#3b82f6" strokeWidth={2}   dot={false} />
        <Line type="monotone" dataKey="stepUp"   name="Step-Up SIP"   stroke="#34d399" strokeWidth={2}   dot={false} />
        <Line type="monotone" dataKey="invested" name="Total Invested" stroke="rgba(148,169,196,0.55)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
        <Line type="monotone" dataKey="goal"     name="Goal"          stroke="#f87171" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
      </ReLineChart>
    </ResponsiveContainer>
  );
}

// ─── ComparisonChart (Portfolio vs Nifty 50) ──────────────────────────────────
export function ComparisonChart({ portfolioSeries, niftySeries }) {
  if (!portfolioSeries.length || !niftySeries.length) return null;

  // Merge the two series by month
  const niftyMap = Object.fromEntries(niftySeries.map(d => [d.month, d.indexed]));
  const merged = portfolioSeries.map(d => ({
    month:     d.month,
    portfolio: d.indexed,
    nifty:     niftyMap[d.month] ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ReLineChart data={merged} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <defs>
          <linearGradient id="cmp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => v.toFixed(0)} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
        <Tooltip formatter={(v, name) => [v?.toFixed(1), name]} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Line type="monotone" dataKey="portfolio" name="Your Portfolio"
          stroke="#3b82f6" strokeWidth={2.5} dot={false}
          activeDot={{ r: 5, fill: '#60a5fa', stroke: '#0b0f1a', strokeWidth: 1.5 }} />
        <Line type="monotone" dataKey="nifty" name="Nifty 50"
          stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false}
          activeDot={{ r: 5, fill: '#f59e0b', stroke: '#0b0f1a', strokeWidth: 1.5 }} />
      </ReLineChart>
    </ResponsiveContainer>
  );
}

// ─── AbsoluteChart (Portfolio value + invested) ───────────────────────────────
export function AbsoluteChart({ portfolioSeries }) {
  if (!portfolioSeries.length) return null;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={portfolioSeries} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <defs>
          <linearGradient id="abs-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(v, name) => [`₹${(v / 100000).toFixed(2)}L`, name]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Area type="monotone" dataKey="value"    name="Portfolio Value" stroke="#3b82f6" strokeWidth={2.5} fill="url(#abs-grad)" dot={false} />
        <Line type="monotone" dataKey="invested" name="Total Invested"  stroke="rgba(148,169,196,0.55)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
