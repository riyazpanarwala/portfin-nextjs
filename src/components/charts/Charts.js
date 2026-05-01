'use client';

// ─── Donut / Pie chart (pure SVG, no library) ──────────────────────────────

export function DonutChart({ data, size = 140, innerRadius = 0.55, showLegend = true }) {
  const r = size / 2;
  const ir = r * innerRadius;
  const total = data.reduce((s, d) => s + d.value, 0);

  const slices = data.reduce((acc, d) => {
    const start = acc.length ? acc[acc.length - 1].end : -Math.PI / 2;
    const sweep = (d.value / total) * 2 * Math.PI;
    return [...acc, { ...d, start, sweep, end: start + sweep }];
  }, []);

  function arc(cx, cy, rx, ry, startAngle, endAngle) {
    const x1 = cx + rx * Math.cos(startAngle);
    const y1 = cy + ry * Math.sin(startAngle);
    const x2 = cx + rx * Math.cos(endAngle);
    const y2 = cy + ry * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => {
          const path = arc(r, r, r - 8, r - 8, s.start, s.end) +
            ` L ${r + (r - 8) * Math.cos(s.end) * innerRadius / ((r-8)/r)} ${r + (r - 8) * Math.sin(s.end) * innerRadius / ((r-8)/r)}` +
            arc(r, r, ir, ir, s.end, s.start).replace('M', ' L') + ' Z';
          const outerPath = arc(r, r, r - 4, r - 4, s.start, s.end);
          const innerPath = arc(r, r, ir, ir, s.end, s.start);
          const fullPath = outerPath + ` L ${r + ir * Math.cos(s.end)} ${r + ir * Math.sin(s.end)} ` + innerPath + ' Z';
          return <path key={i} d={fullPath} fill={s.color} opacity="0.9" />;
        })}
        {/* Inner text */}
        <text x={r} y={r - 6} textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="700" fontFamily="var(--font-mono)">
          {data.length}
        </text>
        <text x={r} y={r + 10} textAnchor="middle" fill="var(--text3)" fontSize="9">
          ASSETS
        </text>
      </svg>
      {showLegend && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--text2)', flex: 1 }}>{d.label}</span>
              <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: '600' }}>
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

export function Sparkline({ data, width = 120, height = 36, color = 'var(--accent)', fill = true }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = line + ` L ${pts[pts.length - 1].x} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height}>
      {fill && (
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={area} fill="url(#sg)" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

export function BarChart({ data, width = 300, height = 120, color = 'var(--accent)' }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data.map(d => d.value));
  const barW = Math.max(4, (width / data.length) - 3);

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const bh = max > 0 ? ((d.value / max) * (height - 20)) : 0;
        const x = i * (width / data.length) + (width / data.length - barW) / 2;
        const y = height - bh - 16;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx="2" fill={d.color || color} opacity="0.8" />
            {data.length <= 12 && (
              <text x={x + barW / 2} y={height - 2} textAnchor="middle" fill="var(--text3)" fontSize="9">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Line chart ───────────────────────────────────────────────────────────────

export function LineChart({ data, width = 300, height = 120, color = 'var(--accent)', xKey = 'x', yKey = 'y' }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => d[yKey]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 20;

  const pts = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + ((max - d[yKey]) / range) * (height - pad * 2),
    label: d[xKey],
    value: d[yKey],
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = line + ` L ${pts[pts.length - 1].x} ${height - pad} L ${pts[0].x} ${height - pad} Z`;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lg)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  );
}

// ─── Horizontal bar ───────────────────────────────────────────────────────────

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

export function HoldingPerformanceChart({ lots, cmp, width = 620, height = 190 }) {
  if (!lots || lots.length === 0 || !cmp) {
    return <div style={{ color: 'var(--text3)', fontSize: 12 }}>No chart data</div>;
  }

  const monthly = {};
  [...lots]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(lot => {
      const month = lot.date.slice(0, 7);
      if (!monthly[month]) monthly[month] = { month, qty: 0, invested: 0 };
      monthly[month].qty += lot.qty;
      monthly[month].invested += lot.qty * lot.price;
    });

  const points = Object.values(monthly)
    .sort((a, b) => a.month.localeCompare(b.month))
    .reduce((acc, row) => {
      const prev = acc[acc.length - 1] || { qty: 0, invested: 0 };
      const qty = prev.qty + row.qty;
      const invested = prev.invested + row.invested;
      return [
        ...acc,
        {
        qty,
        month: row.month,
        invested,
        markedValue: qty * cmp,
        gain: qty * cmp - invested,
        },
      ];
    }, []);

  const chartPoints = points.length < 2
    ? [{ ...points[0], month: 'Start', markedValue: points[0].invested, gain: 0 }, ...points]
    : points;

  const pad = { top: 22, right: 48, bottom: 34, left: 54 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const values = chartPoints.flatMap(p => [p.invested, p.markedValue]);
  const max = Math.max(...values) * 1.08 || 1;
  const min = Math.min(0, ...values) * 0.95;
  const range = max - min || 1;

  function toX(i) {
    return pad.left + (i / Math.max(chartPoints.length - 1, 1)) * chartW;
  }

  function toY(v) {
    return pad.top + ((max - v) / range) * chartH;
  }

  function lineFor(key) {
    return chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p[key])}`).join(' ');
  }

  const valueLine = lineFor('markedValue');
  const investedLine = lineFor('invested');
  const last = chartPoints[chartPoints.length - 1];
  const labels = chartPoints.filter((_, i) => i === 0 || i === chartPoints.length - 1 || i % Math.ceil(chartPoints.length / 5) === 0);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 420, overflow: 'visible' }}>
        <defs>
          <linearGradient id="holdingValueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((level, i) => {
          const y = pad.top + level * chartH;
          return (
            <line key={i} x1={pad.left} x2={pad.left + chartW} y1={y} y2={y}
              stroke="rgba(45,64,96,0.45)" strokeWidth="1" strokeDasharray="4,4" />
          );
        })}

        <path
          d={`${valueLine} L ${toX(chartPoints.length - 1)} ${pad.top + chartH} L ${toX(0)} ${pad.top + chartH} Z`}
          fill="url(#holdingValueGrad)"
        />
        <path d={investedLine} fill="none" stroke="var(--text3)" strokeWidth="1.6" strokeDasharray="5,4" />
        <path d={valueLine} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

        {chartPoints.map((p, i) => (
          <circle key={i} cx={toX(i)} cy={toY(p.markedValue)} r={i === chartPoints.length - 1 ? 4 : 2.5}
            fill="var(--accent2)" stroke="var(--bg)" strokeWidth="1.5" />
        ))}

        {labels.map((p, i) => {
          const idx = chartPoints.indexOf(p);
          return (
            <text key={i} x={toX(idx)} y={height - 10} textAnchor="middle" fill="var(--text3)" fontSize="9">
              {p.month}
            </text>
          );
        })}

        <text x={pad.left} y={12} fill="var(--accent2)" fontSize="10" fontWeight="700">Current marked value</text>
        <line x1={pad.left + 126} y1={9} x2={pad.left + 146} y2={9} stroke="var(--text3)" strokeWidth="1.6" strokeDasharray="5,4" />
        <text x={pad.left + 152} y={12} fill="var(--text3)" fontSize="10" fontWeight="700">Invested</text>

        <text x={pad.left + chartW + 6} y={toY(last.markedValue) + 4}
          fill="var(--accent2)" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700">
          {(last.markedValue / 100000).toFixed(1)}L
        </text>
        <text x={pad.left + chartW + 6} y={toY(last.invested) + 4}
          fill="var(--text3)" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700">
          {(last.invested / 100000).toFixed(1)}L
        </text>
      </svg>
    </div>
  );
}
