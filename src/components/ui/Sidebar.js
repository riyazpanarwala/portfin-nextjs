'use client';

import {
  Bot,
  Camera,
  ChevronLeft,
  ChevronRight,
  Database,
  Gauge,
  Goal,
  History,
  LayoutDashboard,
  LineChart,
  PieChart,
  Plus,
  Scale,
  Sparkles,
  TrendingUp,
  Upload,
  WalletCards,
  Waves,
  CalendarRange,
} from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';

const NAV = [
  {
    group: 'Views',
    items: [
      { id: 'overview',     icon: LayoutDashboard, label: 'Overview' },
      { id: 'mf',           icon: PieChart,        label: 'Mutual Funds' },
      { id: 'stocks',       icon: TrendingUp,      label: 'Equity Stocks' },
      { id: 'analytics',    icon: Gauge,           label: 'Analytics' },
      { id: 'timeline',     icon: History,         label: 'Timeline' },
      { id: 'goal',         icon: Goal,            label: 'Goal Planner' },
      { id: 'waterfall',    icon: Waves,           label: 'Wealth Waterfall' },
      { id: 'action',       icon: Sparkles,        label: 'Action Signal' },
      { id: 'snapshots',    icon: Camera,          label: 'Snapshot History' },
      { id: 'vs-nifty',     icon: LineChart,       label: 'vs Benchmarks' },
    ]
  },
  {
    group: 'Tools',
    items: [
      { id: 'rebalancer',   icon: Scale,        label: 'Rebalancer' },
      { id: 'ai-advisor',   icon: Bot,          label: 'AI Advisor', badge: 'AI' },
      { id: 'instruments',  icon: Database,     label: 'Instruments', badge: 'NEW' },
      { id: 'backfill',     icon: CalendarRange, label: 'Backfill History', badge: 'NEW' },
      { id: 'trade',        icon: Plus,         label: 'Add Trade' },
      // Import is handled as a modal — clicking triggers onImport prop, not a view nav
      { id: '__import',     icon: Upload,       label: 'Import CSV/XLS', badge: 'CSV', _isAction: true },
    ]
  }
];

/**
 * Sidebar
 * Props:
 *   collapsed   boolean
 *   onToggle    () => void
 *   onImport    () => void   — opens the TradeImporter modal
 */
export default function Sidebar({ collapsed, onToggle, onImport }) {
  const { activeView, setActiveView, stats } = usePortfolio();

  function handleNavClick(item) {
    if (item._isAction) {
      if (item.id === '__import') onImport?.();
    } else {
      setActiveView(item.id);
    }
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', minWidth: '32px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: '800', color: '#fff',
            fontFamily: 'var(--font-display)',
          }}><WalletCards size={17} /></div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '0.05em', color: 'var(--text)' }}>PORTFIN</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', letterSpacing: '0.1em' }}>PERSONAL DASHBOARD</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map(section => (
          <div key={section.group} style={{ marginBottom: '16px' }}>
            {!collapsed && (
              <div className="section-title" style={{ paddingLeft: '8px', marginBottom: '6px' }}>
                {section.group}
              </div>
            )}
            {section.items.map(item => {
              const Icon = item.icon;
              const isActive = !item._isAction && activeView === item.id;
              return (
                <div
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNavClick(item)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    marginBottom: '2px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    // Import item gets a subtle teal tint to distinguish it as an action
                    ...(item._isAction && !collapsed && {
                      borderColor: 'rgba(20,184,166,0.15)',
                      background: 'rgba(20,184,166,0.04)',
                    }),
                    // Backfill item gets a subtle green tint
                    ...(item.id === 'backfill' && !collapsed && !isActive && {
                      borderColor: 'rgba(16,185,129,0.15)',
                      background: 'rgba(16,185,129,0.04)',
                    }),
                  }}
                >
                  <Icon size={16} style={{
                    minWidth: '18px',
                    color: item._isAction
                      ? 'var(--teal)'
                      : item.id === 'backfill' && !isActive
                      ? 'var(--green2)'
                      : undefined,
                  }} />
                  {!collapsed && (
                    <span style={{
                      flex: 1,
                      color: item._isAction
                        ? 'var(--teal)'
                        : item.id === 'backfill' && !isActive
                        ? 'var(--green2)'
                        : undefined,
                    }}>{item.label}</span>
                  )}
                  {!collapsed && item.badge && (
                    <span style={{
                      fontSize: '9px', fontWeight: '700', padding: '2px 5px',
                      borderRadius: '4px', letterSpacing: '0.04em',
                      background: item.badge === 'AI'
                        ? 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))'
                        : item.badge === 'CSV'
                          ? 'rgba(20,184,166,0.15)'
                          : 'rgba(16,185,129,0.2)',
                      color: item.badge === 'AI'
                        ? 'var(--accent2)'
                        : item.badge === 'CSV'
                          ? 'var(--teal)'
                          : 'var(--green2)',
                      border: item.badge === 'AI'
                        ? '1px solid rgba(59,130,246,0.4)'
                        : item.badge === 'CSV'
                          ? '1px solid rgba(20,184,166,0.35)'
                          : '1px solid rgba(16,185,129,0.35)',
                      flexShrink: 0,
                    }}>{item.badge}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom stats */}
      {!collapsed && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span className="live-dot" />
            <span style={{ fontSize: '10px', color: 'var(--text3)' }}>LIVE - NSE/BSE</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
            {stats.fundCount} Funds · {stats.stockCount} Stocks
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="sidebar-toggle"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
