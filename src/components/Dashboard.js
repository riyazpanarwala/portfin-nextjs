'use client';

import { useState } from 'react';
import { AlertTriangle, BarChart3, Plus, RefreshCw } from 'lucide-react';
import { usePortfolio } from '@/context/PortfolioContext';
import Sidebar from '@/components/ui/Sidebar';
import Header from '@/components/ui/Header';
import ToastContainer from '@/components/ui/Toast';
import OverviewView from '@/components/views/OverviewView';
import MFView from '@/components/views/MFView';
import StocksView from '@/components/views/StocksView';
import AnalyticsView from '@/components/views/AnalyticsView';
import GoalView from '@/components/views/GoalView';
import RebalancerView from '@/components/views/RebalancerView';
import AIAdvisorView from '@/components/views/AIAdvisorView';
import PortfolioVsNiftyView from '@/components/views/PortfolioVsNiftyView';
import InstrumentsView from '@/components/views/InstrumentsView';
import { TradeForm } from '@/components/views/TradeForm';
import { TimelineView, WaterfallView, ActionView, SnapshotView } from '@/components/views/OtherViews';

const VIEW_TITLES = {
  overview:     'Portfolio Overview',
  mf:           'Mutual Funds',
  stocks:       'Equity Stocks',
  analytics:    'Analytics',
  timeline:     'Investment Timeline',
  goal:         'Goal Planner',
  waterfall:    'Wealth Waterfall',
  action:       'Action Signal',
  snapshots:    'Snapshot History',
  rebalancer:   'Portfolio Rebalancer',
  'vs-nifty':   'Portfolio vs Nifty 50',
  'ai-advisor': 'AI Portfolio Advisor',
  instruments:  'Instrument Manager',
  trade:        'Add Trade',
};

export default function Dashboard() {
  const { activeView, loading, error, trades, refreshData, refreshPrices } = usePortfolio();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell grid-bg">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />

      <div className="app-content">
        <Header onRefreshPrices={refreshPrices} />

        {/* Title bar */}
        <div className="page-titlebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {VIEW_TITLES[activeView] || 'Dashboard'}
            </h1>
            {activeView === 'ai-advisor' && (
              <span className="title-badge" style={{
                fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.2))',
                border: '1px solid rgba(59,130,246,0.4)', color: 'var(--accent2)',
                letterSpacing: '0.04em',
              }}>POWERED BY OLLAMA</span>
            )}
            {activeView === 'vs-nifty' && (
              <span className="title-badge" style={{
                fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px',
                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)',
                color: 'var(--green2)', letterSpacing: '0.04em',
              }}>BENCHMARK COMPARISON</span>
            )}
            {activeView === 'instruments' && (
              <span className="title-badge" style={{
                fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px',
                background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)',
                color: 'var(--orange)', letterSpacing: '0.04em',
              }}>NSE · BSE · AMFI</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {loading && <Spinner />}
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        <main className="app-main">
          {error ? <ErrorState message={error} onRetry={refreshData} /> :
           loading ? <LoadingState /> :
           trades.length === 0 && activeView !== 'trade' && activeView !== 'ai-advisor' && activeView !== 'instruments' ? <EmptyState /> :
           <ViewRenderer view={activeView} />}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

function ViewRenderer({ view }) {
  switch (view) {
    case 'overview':    return <OverviewView />;
    case 'mf':          return <MFView />;
    case 'stocks':      return <StocksView />;
    case 'analytics':   return <AnalyticsView />;
    case 'timeline':    return <TimelineView />;
    case 'goal':        return <GoalView />;
    case 'waterfall':   return <WaterfallView />;
    case 'action':      return <ActionView />;
    case 'snapshots':   return <SnapshotView />;
    case 'rebalancer':  return <RebalancerView />;
    case 'vs-nifty':    return <PortfolioVsNiftyView />;
    case 'ai-advisor':  return <AIAdvisorView />;
    case 'instruments': return <InstrumentsView />;
    case 'trade':       return <TradeForm />;
    default:            return <OverviewView />;
  }
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text3)' }}>
      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
      Loading...
    </div>
  );
}

function LoadingState() {
  return (
    <div className="fade-up">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px', marginBottom: '20px' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="metric-card">
            <div className="skeleton" style={{ height: '11px', width: '60%', marginBottom: '10px' }} />
            <div className="skeleton" style={{ height: '24px', width: '80%', marginBottom: '6px' }} />
            <div className="skeleton" style={{ height: '11px', width: '50%' }} />
          </div>
        ))}
      </div>
      <div className="glass" style={{ padding: '20px' }}>
        <div className="skeleton" style={{ height: '13px', width: '200px', marginBottom: '16px' }} />
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: '40px', marginBottom: '8px' }} />)}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
      <AlertTriangle size={42} color="var(--yellow)" />
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>Failed to connect to database</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--red2)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', maxWidth: '480px', wordBreak: 'break-all' }}>
        {message}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '400px', textAlign: 'center' }}>
        Set <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>DATABASE_URL</code> in <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>.env</code> then run <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>npx prisma db push</code> and <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>npm run db:seed</code>
      </div>
      <button className="btn btn-primary" onClick={onRetry}><RefreshCw size={15} /> Retry Connection</button>
    </div>
  );
}

function EmptyState() {
  const { setActiveView } = usePortfolio();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
      <BarChart3 size={48} color="var(--accent2)" />
      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>Database connected - no trades yet</div>
      <div style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '400px', textAlign: 'center' }}>
        Run <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>npm run db:seed</code> to import your portfolio from Excel, or add trades manually.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={() => setActiveView('trade')} style={{ padding: '10px 24px' }}>
          <Plus size={16} /> Add Trade Manually
        </button>
        <button className="btn btn-ghost" onClick={() => setActiveView('instruments')} style={{ padding: '10px 24px' }}>
          📂 Manage Instruments
        </button>
      </div>
    </div>
  );
}
