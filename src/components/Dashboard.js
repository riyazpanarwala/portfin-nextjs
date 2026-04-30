'use client';

import { useState } from 'react';
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
import { TradeForm } from '@/components/views/TradeForm';
import { TimelineView, WaterfallView, ActionView, SnapshotView } from '@/components/views/OtherViews';

const VIEW_TITLES = {
  overview:   'Portfolio Overview',
  mf:         'Mutual Funds',
  stocks:     'Equity Stocks',
  analytics:  'Analytics',
  timeline:   'Investment Timeline',
  goal:       'Goal Planner',
  waterfall:  'Wealth Waterfall',
  action:     'Action Signal',
  snapshots:  'Snapshot History',
  rebalancer: 'Portfolio Rebalancer',
  'vs-nifty': 'Portfolio vs Nifty 50',
  'ai-advisor': 'AI Portfolio Advisor',
  trade:      'Add Trade',
};

export default function Dashboard() {
  const { activeView, loading, error, trades, refreshData, refreshPrices } = usePortfolio();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }} className="grid-bg">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header onRefreshPrices={refreshPrices} />

        {/* Title bar */}
        <div style={{
          padding: '14px 24px 10px', borderBottom: '1px solid var(--border)',
          background: 'rgba(11,15,26,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {VIEW_TITLES[activeView] || 'Dashboard'}
            </h1>
            {activeView === 'ai-advisor' && (
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.2))',
                border: '1px solid rgba(59,130,246,0.4)', color: 'var(--accent2)',
                letterSpacing: '0.04em',
              }}>POWERED BY OLLAMA</span>
            )}
            {activeView === 'vs-nifty' && (
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px',
                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)',
                color: 'var(--green2)', letterSpacing: '0.04em',
              }}>BENCHMARK COMPARISON</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {loading && <Spinner />}
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {error ? <ErrorState message={error} onRetry={refreshData} /> :
           loading ? <LoadingState /> :
           trades.length === 0 && activeView !== 'trade' && activeView !== 'ai-advisor' ? <EmptyState /> :
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
    case 'trade':       return <TradeForm />;
    default:            return <OverviewView />;
  }
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text3)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--border2)" strokeWidth="2.5"/>
        <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      Loading…
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
      <div style={{ fontSize: '40px' }}>⚠️</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>Failed to connect to database</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--red2)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 16px', maxWidth: '480px', wordBreak: 'break-all' }}>
        {message}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '400px', textAlign: 'center' }}>
        Set <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>DATABASE_URL</code> in <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>.env</code> then run <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>npx prisma db push</code> and <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>npm run db:seed</code>
      </div>
      <button className="btn btn-primary" onClick={onRetry}>↺ Retry Connection</button>
    </div>
  );
}

function EmptyState() {
  const { setActiveView } = usePortfolio();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>📊</div>
      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>Database connected — no trades yet</div>
      <div style={{ fontSize: '13px', color: 'var(--text2)', maxWidth: '400px', textAlign: 'center' }}>
        Run <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent2)' }}>npm run db:seed</code> to import your portfolio from Excel, or add trades manually.
      </div>
      <button className="btn btn-primary" onClick={() => setActiveView('trade')} style={{ padding: '10px 24px' }}>
        + Add Trade Manually
      </button>
    </div>
  );
}
