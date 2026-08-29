'use client';

/**
 * components/charts/Charts.js
 *
 * CHANGES:
 *  - CSS_VAR_MAP removed — resolveColor imported from lib/colorResolver.js
 *  - SharedTooltip: single reusable custom tooltip that always renders ALL
 *    series at the hovered x-position, regardless of cursor proximity.
 *    Applied to ComparisonChart (Indexed), AbsoluteChart, CagrTrendChart,
 *    and DrawdownChart.
 *  - AbsoluteChart: fixed the <AreaChart> + mixed <Line> bug where Recharts
 *    doesn't fire hover events for <Line> inside <AreaChart>. Switched to
 *    <ComposedChart> so both series track correctly.
 */

import { resolveColor } from '@/lib/colorResolver';

import {
  LineChart as ReLineChart,
  BarChart as ReBarChart,
  PieChart as RePieChart,
  Pie,
  ComposedChart,
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

// ─── Smart Y-axis formatter ───────────────────────────────────────────────────
function yFmt(v, maxVal) {
  const abs = Math.abs(Number(v) || 0);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const CHART_STYLE = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
};

const GRID_COLOR    = 'rgba(45,64,96,0.4)';
const TICK_COLOR    = '#5c7a9a';
const TOOLTIP_STYLE = {
  background: '#111827',
  border: '1px solid #2d4060',
  borderRadius: 8,
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#e8eef8',
};

// ─── SharedTooltip ────────────────────────────────────────────────────────────
// Always renders every series at the hovered x-position, regardless of which
// line the cursor is geometrically nearest to.
//
// Props (Recharts injects active / payload / label automatically):
//   series  – ordered array of { key, name, color, formatter? }
//             When provided, rows are rendered in this exact order and any
//             key missing from Recharts' payload shows '—' instead of being
//             silently dropped.
//   formatter – fallback (value: number) => string when a row has no own formatter
//
// Why this is needed:
//   Recharts' default <Tooltip> only puts the nearest dataKey into its payload
//   rendering when lines are far apart vertically (e.g. MF CAGR at 13% and
//   Stock CAGR at -3%). The raw `payload` array from Recharts DOES contain all
//   series; the built-in renderer simply filters by proximity. We bypass that
//   by reading payload into a Map and rendering from our own `series` list.

function SharedTooltip({ active, payload, label, formatter, series, labelFormatter }) {
  if (!active) return null;

  // Build a keyed map from whatever Recharts provides at this x-position
  const byKey = {};
  if (payload) {
    payload.forEach(p => {
      byKey[p.dataKey] = { value: p.value, color: p.color, name: p.name };
    });
  }

  // Render rows in the caller-supplied order, or fall back to payload order
  const rows = series
    ? series.map(s => ({
        key:   s.key,
        name:  s.name,
        color: s.color,
        value: byKey[s.key]?.value ?? null,
        fmt:   s.formatter ?? formatter,
      }))
    : (payload ?? []).map(p => ({
        key:   p.dataKey,
        name:  p.name,
        color: p.color,
        value: p.value,
        fmt:   formatter,
      }));

  if (!rows.length) return null;

  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '10px 14px', minWidth: 178 }}>
      <div style={{
        fontSize: 10, color: TICK_COLOR, fontWeight: 700,
        letterSpacing: '0.06em', marginBottom: 8,
      }}>
        {labelFormatter ? labelFormatter(label) : label}
      </div>
      {rows.map(({ key, name, color, value, fmt }) => {
        const display = value == null ? '—' : fmt ? fmt(value) : String(value);
        return (
          <div key={key} style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', gap: 20, marginBottom: 4,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a9c4' }}>
              <span style={{
                display: 'inline-block', width: 8, height: 8,
                borderRadius: '50%', background: color, flexShrink: 0,
              }} />
              {name}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, fontWeight: 700, color,
            }}>
              {display}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const DEFAULT_DONUT_PALETTE = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4',
  '#f97316', '#6366f1', '#14b8a6', '#eab308', '#a855f7', '#34d399',
  '#60a5fa', '#f43f5e', '#2dd4bf', '#fbbf24', '#c084fc', '#4ade80'
];

// ─── DonutChart ───────────────────────────────────────────────────────────────
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

  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = data.reduce(({ currentAngle, result }, d) => {
    const sweep = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    const path = arcPath(currentAngle, currentAngle + sweep);
    return {
      currentAngle: currentAngle + sweep,
      result: [...result, { ...d, path }],
    };
  }, { currentAngle: -Math.PI / 2, result: [] }).result;

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

// ─── AllocationDonutChart Custom Tooltip ──────────────────────────────────────
function AllocationTooltip({ active, payload, valueFormatter }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  const valFmt = valueFormatter || (v => {
    const abs = Math.abs(Number(v) || 0);
    if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
    return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  });

  return (
    <div style={{
      background: '#111827',
      border: '1px solid #2d4060',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      color: '#e8eef8',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      zIndex: 1000,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      maxWidth: 320,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 700, color: item.color || '#60a5fa' }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: item.color || '#60a5fa', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
          {item.label}
        </span>
        {item.assetType && (
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 3,
            background: item.assetType === 'STOCK' ? 'rgba(139,92,246,0.2)' : 'rgba(20,184,166,0.2)',
            color: item.assetType === 'STOCK' ? '#c084fc' : '#2dd4bf',
            fontWeight: 700, flexShrink: 0,
          }}>
            {item.assetType}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ color: '#94a9c4' }}>Allocation:</span>
        <span style={{ fontWeight: 800, color: '#34d399' }}>{item.pct != null ? `${item.pct.toFixed(1)}%` : '—'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ color: '#94a9c4' }}>Market Value:</span>
        <span style={{ fontWeight: 700, color: '#e8eef8' }}>{valFmt(item.value)}</span>
      </div>
    </div>
  );
}

// ─── AllocationDonutChart ────────────────────────────────────────────────────
export function AllocationDonutChart({
  data,
  size = 240,
  innerRadius = 0.56,
  showLegend = true,
  centerLabel,
  centerSub = 'HOLDINGS',
  maxLegendHeight = 260,
  legendGrid = true,
  valueFormatter,
}) {
  if (!data || !data.length) return null;

  const valFmt = valueFormatter || (v => {
    const abs = Math.abs(Number(v) || 0);
    if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
    return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  });

  // Enhance data with colors if not provided
  const chartData = data.map((d, i) => ({
    ...d,
    color: resolveColor(d.color, DEFAULT_DONUT_PALETTE[i % DEFAULT_DONUT_PALETTE.length]),
  }));

  const rInner = (size / 2) * innerRadius;
  const rOuter = (size / 2) * 0.88;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', width: '100%' }}>
      {/* Donut chart container */}
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <ResponsiveContainer width={size} height={size}>
          <RePieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={rInner}
              outerRadius={rOuter}
              paddingAngle={chartData.length > 1 ? 2 : 0}
              dataKey="value"
              nameKey="label"
              stroke="#0b0f1a"
              strokeWidth={1.5}
              isAnimationActive={true}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={<AllocationTooltip valueFormatter={valueFormatter} />}
              wrapperStyle={{ pointerEvents: 'none', zIndex: 1000 }}
              allowEscapeViewBox={{ x: true, y: true }}
              offset={15}
            />
          </RePieChart>
        </ResponsiveContainer>

        {/* Center overlay label */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: size >= 200 ? 20 : 15, fontWeight: 800, color: '#e8eef8', fontFamily: 'var(--font-mono)' }}>
            {centerLabel ?? data.length}
          </span>
          <span style={{ fontSize: size >= 200 ? 10 : 8, color: '#5c7a9a', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 2 }}>
            {centerSub}
          </span>
        </div>
      </div>

      {/* Legend Container */}
      {showLegend && (
        <div style={{
          display: legendGrid ? 'grid' : 'flex',
          flexDirection: legendGrid ? undefined : 'column',
          gridTemplateColumns: legendGrid ? 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))' : undefined,
          gap: 8,
          maxHeight: maxLegendHeight,
          overflowY: 'auto',
          paddingRight: 6,
          flex: 1,
          minWidth: 'min(240px, 100%)',
          alignContent: 'start',
        }}>
          {chartData.map((d, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'background 0.15s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <div style={{ width: 9, height: 9, borderRadius: 2.5, background: d.color, flexShrink: 0 }} />
                <span style={{
                  fontSize: 12,
                  color: 'var(--text2)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: 500,
                }} title={d.label}>
                  {d.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
                  {valFmt(d.value)}
                </span>
                <span style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)',
                }}>
                  {d.pct ? d.pct.toFixed(1) + '%' : '0%'}
                </span>
              </div>
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
export function BarChart({
  data,
  width = 300,
  height = 120,
  color = '#3b82f6',
  valueFormatter,
  xTickFormatter,
}) {
  if (!data || !data.length) return null;
  const resolvedColor = resolveColor(color, '#3b82f6');
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const formatValue = valueFormatter || (v => yFmt(v, maxVal));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tickFormatter={xTickFormatter} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatValue} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={v => formatValue(v)}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#e8eef8', fontWeight: 700, marginBottom: 6 }}
          itemStyle={{ color: '#e8eef8' }}
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

  const hpSeries = [
    { key: 'value',    name: 'Market Value', color: '#60a5fa', formatter: v => `₹${(v / 100000).toFixed(2)}L` },
    { key: 'invested', name: 'Invested',     color: '#94a9c4', formatter: v => `₹${(v / 100000).toFixed(2)}L` },
  ];

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ReLineChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          content={<SharedTooltip series={hpSeries} />}
          cursor={{ stroke: 'rgba(148,169,196,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Line type="monotone" dataKey="value"    name="Market Value" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="invested" name="Invested"     stroke="rgba(148,169,196,0.6)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
      </ReLineChart>
    </ResponsiveContainer>
  );
}

// ─── WaterfallChart ───────────────────────────────────────────────────────────
export function WaterfallChart({ steps }) {
  if (!steps || !steps.length) return null;

  const chartData = steps.reduce(({ running, result }, s) => {
    if (s.isTotal) {
      return {
        running,
        result: [...result, { label: s.label, spacer: 0, bar: s.value, color: resolveColor(s.color, '#60a5fa') }],
      };
    }
    const base = running;
    const nextRunning = running + s.value;
    const item = {
      label: s.label,
      spacer: Math.min(base, base + s.value),
      bar: Math.abs(s.value),
      color: resolveColor(s.color, '#60a5fa'),
    };
    return {
      running: nextRunning,
      result: [...result, item],
    };
  }, { running: 0, result: [] }).result;

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
        <Bar dataKey="spacer" stackId="wf" fill="transparent" legendType="none" />
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

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ReLineChart data={merged} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
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

// ─── ComparisonChart (Indexed view) ──────────────────────────────────────────
// Fix: replaced the default formatter-based tooltip with SharedTooltip so all
// benchmark lines are always visible at every hover point.
export function ComparisonChart({ portfolioSeries, niftySeries, benchmarkSeries }) {
  const benchmarks = benchmarkSeries ?? (niftySeries ? [{
    key:   'nifty50',
    label: 'Nifty 50',
    color: '#f59e0b',
    data:  niftySeries,
  }] : []);

  if (!portfolioSeries.length) return null;

  const benchMaps = benchmarks.map(b =>
    Object.fromEntries(b.data.map(d => [d.month, d.indexed]))
  );

  const merged = portfolioSeries.map(d => {
    const row = { month: d.month, portfolio: d.indexed };
    benchmarks.forEach((b, i) => {
      row[b.key] = benchMaps[i][d.month] ?? null;
    });
    return row;
  });

  // Build the fixed series list for SharedTooltip
  const tooltipSeries = [
    { key: 'portfolio', name: 'Your Portfolio', color: '#60a5fa', formatter: v => v?.toFixed(1) },
    ...benchmarks.map(b => ({
      key:       b.key,
      name:      b.label,
      color:     resolveColor(b.color, b.color),
      formatter: v => v?.toFixed(1),
    })),
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ReLineChart data={merged} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="month" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => v.toFixed(0)} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
        <Tooltip
          content={<SharedTooltip series={tooltipSeries} />}
          cursor={{ stroke: 'rgba(148,169,196,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Line
          type="monotone"
          dataKey="portfolio"
          name="Your Portfolio"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: '#60a5fa', stroke: '#0b0f1a', strokeWidth: 1.5 }}
        />
        {benchmarks.map((b, i) => (
          <Line
            key={b.key}
            type="monotone"
            dataKey={b.key}
            name={b.label}
            stroke={resolveColor(b.color, b.color)}
            strokeWidth={1.8}
            strokeDasharray={i === 0 ? '6 3' : i === 1 ? '3 3' : '8 2 2 2'}
            dot={false}
            connectNulls
            activeDot={{ r: 4, fill: resolveColor(b.color, b.color), stroke: '#0b0f1a', strokeWidth: 1.5 }}
          />
        ))}
      </ReLineChart>
    </ResponsiveContainer>
  );
}

// ─── CagrTrendChart ───────────────────────────────────────────────────────────
// Fix: uses SharedTooltip so both MF CAGR and Stock CAGR always show even when
// cursor is far from one of the lines.
export function CagrTrendChart({ series }) {
  if (!series.length) return null;

  const hasMF = series.some(d => d.mfCagr != null);
  const hasST = series.some(d => d.stCagr != null);

  if (!hasMF && !hasST) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 260, color: 'var(--text3)', fontSize: 13,
      }}>
        No CAGR data available — save more snapshots over time.
      </div>
    );
  }

  const tooltipSeries = [
    hasMF && { key: 'mfCagr', name: 'MF CAGR',    color: '#a78bfa', formatter: v => `${v.toFixed(2)}%` },
    hasST && { key: 'stCagr', name: 'Stock CAGR',  color: '#2dd4bf', formatter: v => `${v.toFixed(2)}%` },
  ].filter(Boolean);
  const chartSeries = series.map((d, i) => ({
    ...d,
    cagrX: d.date || `${d.month}-${String(i).padStart(3, '0')}`,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ReLineChart data={chartSeries} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="cagrX"
          tickFormatter={v => String(v).slice(0, 7)}
          tick={{ fill: TICK_COLOR, fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={42} />
        <Tooltip
          content={<SharedTooltip
            series={tooltipSeries}
            labelFormatter={label => String(label).slice(0, 16).replace('T', ' ')}
          />}
          cursor={{ stroke: 'rgba(148,169,196,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        {hasMF && (
          <Line type="monotone" dataKey="mfCagr" name="MF CAGR"
            stroke="#8b5cf6" strokeWidth={2.5} dot={false} connectNulls
            activeDot={{ r: 5, fill: '#a78bfa', stroke: '#0b0f1a', strokeWidth: 1.5 }} />
        )}
        {hasST && (
          <Line type="monotone" dataKey="stCagr" name="Stock CAGR"
            stroke="#14b8a6" strokeWidth={2.5} dot={false} connectNulls
            activeDot={{ r: 5, fill: '#2dd4bf', stroke: '#0b0f1a', strokeWidth: 1.5 }} />
        )}
      </ReLineChart>
    </ResponsiveContainer>
  );
}

// ─── AbsoluteChart ────────────────────────────────────────────────────────────
// Fix: was <AreaChart> with a mix of <Area> + <Line>. Recharts does not fire
// hover/tooltip events for <Line> children inside <AreaChart>, so the "Total
// Invested" dashed line never updated the tooltip — it always showed the last
// rendered value. Switched to <ComposedChart> which supports both <Area> and
// <Line> with full hover tracking.
export function AbsoluteChart({ portfolioSeries }) {
  if (!portfolioSeries.length) return null;

  const tooltipSeries = [
    { key: 'value',    name: 'Portfolio Value', color: '#60a5fa', formatter: v => `₹${(v / 100000).toFixed(2)}L` },
    { key: 'invested', name: 'Total Invested',  color: '#94a9c4', formatter: v => `₹${(v / 100000).toFixed(2)}L` },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={portfolioSeries} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
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
          content={<SharedTooltip series={tooltipSeries} />}
          cursor={{ stroke: 'rgba(148,169,196,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        {/* Area for portfolio value — fills below the line */}
        <Area
          type="monotone"
          dataKey="value"
          name="Portfolio Value"
          stroke="#3b82f6"
          strokeWidth={2.5}
          fill="url(#abs-grad)"
          dot={false}
          activeDot={{ r: 5, fill: '#60a5fa', stroke: '#0b0f1a', strokeWidth: 1.5 }}
        />
        {/* Line for invested — no fill, just a dashed reference line */}
        <Line
          type="monotone"
          dataKey="invested"
          name="Total Invested"
          stroke="rgba(148,169,196,0.7)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          dot={false}
          activeDot={{ r: 4, fill: '#94a9c4', stroke: '#0b0f1a', strokeWidth: 1.5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── DrawdownChart ────────────────────────────────────────────────────────────
function DrawdownStat({ label, value, month, color }) {
  const valueColor =
    value < -20 ? '#f87171' :
    value < -10 ? '#f59e0b' :
                  '#34d399';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '8px 12px',
      background: `${color}12`,
      border: `1px solid ${color}35`,
      borderRadius: 8,
      minWidth: 148,
      flex: '0 0 auto',
    }}>
      <div style={{
        fontSize: 9, color: TICK_COLOR, fontWeight: 700,
        letterSpacing: '0.07em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 800,
        fontFamily: "'JetBrains Mono', monospace",
        color: valueColor,
      }}>
        {value.toFixed(2)}%
      </div>
      {month && (
        <div style={{ fontSize: 10, color: TICK_COLOR }}>worst: {month}</div>
      )}
    </div>
  );
}

function computeDrawdownSeries(series) {
  let peak = -Infinity;
  return series.map(d => {
    if (d.indexed > peak) peak = d.indexed;
    const dd = peak > 0 ? ((d.indexed - peak) / peak) * 100 : 0;
    return { month: d.month, dd };
  });
}

export function DrawdownChart({ portfolioSeries, benchmarkSeries = [] }) {
  if (!portfolioSeries || portfolioSeries.length < 2) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 220, color: TICK_COLOR, fontSize: 13,
      }}>
        Not enough data — save more snapshots over time.
      </div>
    );
  }

  const portDD = computeDrawdownSeries(portfolioSeries);

  const activeBenches = benchmarkSeries.filter(b => b.data && b.data.length > 0);
  const benchDDs = activeBenches.map(b => ({
    key:   b.key,
    label: b.label,
    color: b.hexColor || resolveColor(b.color, '#94a9c4'),
    dd:    computeDrawdownSeries(b.data),
  }));

  const benchMaps = benchDDs.map(b =>
    Object.fromEntries(b.dd.map(d => [d.month, d.dd]))
  );

  const merged = portDD.map(d => {
    const row = { month: d.month, portfolio: parseFloat(d.dd.toFixed(2)) };
    benchDDs.forEach((b, i) => {
      const val = benchMaps[i][d.month];
      row[b.key] = val != null ? parseFloat(val.toFixed(2)) : null;
    });
    return row;
  });

  const portMaxDD    = Math.min(...portDD.map(d => d.dd));
  const portMaxMonth = portDD.find(d => d.dd === portMaxDD)?.month;

  const benchStats = benchDDs.map(b => {
    const max   = Math.min(...b.dd.map(d => d.dd));
    const month = b.dd.find(d => d.dd === max)?.month;
    return { key: b.key, label: b.label, color: b.color, max, month };
  });

  const currentDD    = portDD[portDD.length - 1]?.dd ?? 0;
  const isInDrawdown = currentDD < -0.1;

  const ddTooltipSeries = [
    { key: 'portfolio', name: 'Your Portfolio', color: '#60a5fa', formatter: v => `${v.toFixed(2)}%` },
    ...benchDDs.map(b => ({
      key:       b.key,
      name:      b.label,
      color:     b.color,
      formatter: v => `${v.toFixed(2)}%`,
    })),
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <DrawdownStat
          label="Portfolio max drawdown"
          value={portMaxDD}
          month={portMaxMonth}
          color="#3b82f6"
        />
        {benchStats.map(b => (
          <DrawdownStat key={b.key} label={`${b.label} max DD`} value={b.max} month={b.month} color={b.color} />
        ))}
        {isInDrawdown && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            padding: '8px 12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, minWidth: 148, flex: '0 0 auto',
          }}>
            <div style={{ fontSize: 9, color: TICK_COLOR, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Current drawdown
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: '#f87171' }}>
              {currentDD.toFixed(2)}%
            </div>
            <div style={{ fontSize: 10, color: '#f87171' }}>still recovering</div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={merged} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} style={CHART_STYLE}>
          <defs>
            <linearGradient id="dd-portfolio-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.04} />
            </linearGradient>
            {benchDDs.map(b => (
              <linearGradient key={b.key} id={`dd-bench-${b.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor={b.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={b.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="month" tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill: TICK_COLOR, fontSize: 9 }} axisLine={false} tickLine={false} width={42} domain={['auto', 0]} />
          <Tooltip
            content={<SharedTooltip series={ddTooltipSeries} />}
            cursor={{ stroke: 'rgba(148,169,196,0.25)', strokeWidth: 1, strokeDasharray: '4 4' }}
          />
          <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
          {benchDDs.map((b, i) => (
            <Area
              key={b.key}
              type="monotone"
              dataKey={b.key}
              name={b.label}
              stroke={b.color}
              strokeWidth={1.6}
              strokeDasharray={i === 0 ? '6 3' : i === 1 ? '3 3' : '8 2 2 2'}
              fill={`url(#dd-bench-${b.key})`}
              dot={false}
              connectNulls
              activeDot={{ r: 4, fill: b.color, stroke: '#0b0f1a', strokeWidth: 1.5 }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="portfolio"
            name="Your Portfolio"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#dd-portfolio-grad)"
            dot={false}
            activeDot={{ r: 5, fill: '#60a5fa', stroke: '#0b0f1a', strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ fontSize: 10, color: TICK_COLOR, marginTop: 6, lineHeight: 1.7 }}>
        <strong style={{ color: '#94a9c4' }}>Drawdown</strong> = % decline from the highest
        portfolio value reached up to that month. −20% means the portfolio was 20% below
        its prior peak. A shallower curve vs the benchmark signals better downside protection.
      </div>
    </div>
  );
}
