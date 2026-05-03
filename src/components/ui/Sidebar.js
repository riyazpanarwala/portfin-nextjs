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
  WalletCards,
  Waves,
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
      { id: 'vs-nifty',     icon: LineChart,       label: 'vs Nifty 50', badge: 'NEW' },
    ]
  },
  {
    group: 'Tools',
    items: [
      { id: 'rebalancer',   icon: Scale,    label: 'Rebalancer' },
      { id: 'ai-advisor',   icon: Bot,      label: 'AI Advisor', badge: 'AI' },
      { id: 'instruments',  icon: Database, label: 'Instruments', badge: 'NEW' },
      { id: 'trade',        icon: Plus,     label: 'Add Trade' },
    ]
  }
];

export default function Sidebar({ collapsed, onToggle }) {
  const { activeView, setActiveView, stats } = usePortfolio();

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
              return (
                <div
                  key={item.id}
                  className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                  onClick={() => setActiveView(item.id)}
                  title={collapsed ? item.label : undefined}
                  style={{ marginBottom: '2px', justifyContent: collapsed ? 'center' : 'flex-start' }}
                >
                  <Icon size={16} style={{ minWidth: '18px' }} />
                  {!collapsed && (
                    <span style={{ flex: 1 }}>{item.label}</span>
                  )}
                  {!collapsed && item.badge && (
                    <span style={{
                      fontSize: '9px', fontWeight: '700', padding: '2px 5px',
                      borderRadius: '4px', letterSpacing: '0.04em',
                      background: item.badge === 'AI'
                        ? 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))'
                        : 'rgba(16,185,129,0.2)',
                      color: item.badge === 'AI' ? 'var(--accent2)' : 'var(--green2)',
                      border: item.badge === 'AI'
                        ? '1px solid rgba(59,130,246,0.4)'
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
            {stats.fundCount} Funds - {stats.stockCount} Stocks
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
