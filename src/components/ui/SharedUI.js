'use client';

import { usePortfolio } from '@/context/PortfolioContext';

// ─── StatCard ─────────────────────────────────────────────────────────────────
// Unified metric card used in OverviewView, GoalView, PortfolioVsNiftyView,
// AnalyticsView, and the holdings summary strips.
//
// Props:
//   label  – uppercase label above the value
//   value  – main display value (string or number)
//   sub    – small text below value (optional)
//   color  – CSS color for the value
//   flip   – if true, renders value above label (AnalyticsView Return Metrics)
//   valueSize – override font-size of value in px (default 18)

export function StatCard({ label, value, sub, color, flip = false, valueSize = 18 }) {
  const labelEl = (
    <div style={{
      fontSize: 10, color: 'var(--text3)', fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      marginBottom: flip ? 0 : 4, marginTop: flip ? 2 : 0,
    }}>
      {label}
    </div>
  );

  const valueEl = (
    <div style={{
      fontSize: valueSize, fontWeight: 700,
      fontFamily: 'var(--font-mono)', color: color || 'var(--text)',
      marginBottom: sub ? 2 : 0,
    }}>
      {value ?? '—'}
    </div>
  );

  const subEl = sub && (
    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{sub}</div>
  );

  return (
    <div className="metric-card">
      {flip ? <>{valueEl}{labelEl}{subEl}</> : <>{labelEl}{valueEl}{subEl}</>}
    </div>
  );
}

// ─── Alert ────────────────────────────────────────────────────────────────────
// Used in OverviewView portfolio alerts and OtherViews ActionView pulse cards.
//
// type: 'warning' | 'info' | 'success' | 'error'

const ALERT_CFG = {
  warning: { color: 'var(--yellow)',  bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',   icon: '⚠' },
  info:    { color: 'var(--accent2)', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.3)',   icon: 'ℹ' },
  success: { color: 'var(--green2)',  bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   icon: '✓' },
  error:   { color: 'var(--red2)',    bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    icon: '✕' },
};

export function Alert({ type = 'info', msg }) {
  const { color, bg, border, icon } = ALERT_CFG[type] || ALERT_CFG.info;
  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 8, padding: '10px 12px',
      display: 'flex', gap: 8,
    }}>
      <span style={{ color, fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{msg}</span>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
// Generic empty-state screen used wherever there's no data yet.
// Replaces: OverviewView EmptyState, OtherViews EmptySection, HoldingsShared HoldingsEmpty.
//
// Props:
//   icon   – large emoji or character
//   label  – primary message
//   sub    – optional secondary line
//   cta    – button label (optional; if omitted no button is rendered)
//   onCta  – click handler for the button
//   extra  – optional additional JSX rendered below the button

export function EmptyState({ icon, label, sub, cta, onCta, extra }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '60vh', gap: 16,
    }}>
      <div style={{ fontSize: 44 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 400, textAlign: 'center' }}>{sub}</div>
      )}
      {cta && onCta && (
        <button className="btn btn-primary" onClick={onCta} style={{ padding: '10px 24px' }}>
          {cta}
        </button>
      )}
      {extra}
    </div>
  );
}

// ─── SummaryStrip ─────────────────────────────────────────────────────────────
// The horizontal metric strip at the top of MFView, StocksView, etc.
// Keeps the data-driven loop pattern but removes repetition of the wrapper div.
//
// items: Array<{ l: string, v: string|number, c: string, sub?: string }>
// cols: CSS grid-template-columns value (default: repeat auto-fit minmax 120px)

export function SummaryStrip({ items, cols = 'repeat(auto-fit, minmax(120px, 1fr))', gap = 10 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap }}>
      {items.map((m, i) => (
        <div key={i} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '11px 14px',
        }}>
          <div style={{
            fontSize: 9, color: 'var(--text3)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3,
          }}>{m.l}</div>
          <div style={{
            fontSize: m.size || 18, fontWeight: 700,
            fontFamily: 'var(--font-mono)', color: m.c,
          }}>{m.v ?? '—'}</div>
          {m.sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}
