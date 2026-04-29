'use client';

// ─── Donut / Pie chart (pure SVG, no library) ──────────────────────────────

export function DonutChart({ data, size = 140, innerRadius = 0.55, showLegend = true }) {
  const r = size / 2;
  const ir = r * innerRadius;
  const total = data.reduce((s, d) => s + d.value, 0);

  let angle = -Math.PI / 2;
  const slices = data.map(d => {
    const start = angle;
    const sweep = (d.value / total) * 2 * Math.PI;
    angle += sweep;
    return { ...d, start, sweep, end: angle };
  });

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
