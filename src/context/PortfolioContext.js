'use client';

import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  computeHoldings,
  computePortfolioStats,
  buildMonthlyFlow,
  computeTax,
  computeRealizedSummary,
  computePortfolioXIRR,
} from '@/lib/store';

const PortfolioCtx = createContext(null);
const DEFAULT_USER_ID = 'user-default-001';

export function PortfolioProvider({ children }) {
  const [trades, setTrades]               = useState([]);
  const [portfolioId, setPortfolioId]     = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});
  const [priceMeta, setPriceMeta]         = useState({});
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [activeView, setActiveView]       = useState('overview');
  const [toasts, setToasts]               = useState([]);

  // ── Load portfolio + trades ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Get or create portfolio
      let pfRes = await fetch(`/api/portfolio?userId=${DEFAULT_USER_ID}`);
      if (!pfRes.ok) throw new Error(await pfRes.text());
      let pfData = await pfRes.json();

      let pid = pfData.portfolios?.[0]?.id;
      if (!pid) {
        const cr = await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: DEFAULT_USER_ID }),
        });
        if (!cr.ok) throw new Error(await cr.text());
        pid = (await cr.json()).portfolio.id;
      }
      setPortfolioId(pid);

      // 2. Fetch trades
      const tRes = await fetch(`/api/trades?portfolioId=${pid}`);
      if (!tRes.ok) throw new Error(await tRes.text());
      const { trades: rawTrades } = await tRes.json();
      setTrades(rawTrades || []);

      // 3. Fetch current prices for all unique symbols
      const symbols = [...new Set((rawTrades || []).map(t => t.symbol))];
      if (symbols.length > 0) {
        const prRes = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols, cacheOnly: true }),
        });
        if (prRes.ok) {
          const priceData = await prRes.json();
          setCurrentPrices(priceData.prices || {});
          setPriceMeta(priceData.meta || {});
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const holdings       = useMemo(() => computeHoldings(trades, currentPrices),    [trades, currentPrices]);
  const stats          = useMemo(() => computePortfolioStats(holdings),            [holdings]);
  const mfHoldings     = useMemo(() => holdings.filter(h => h.assetType === 'MF'),    [holdings]);
  const stHoldings     = useMemo(() => holdings.filter(h => h.assetType === 'STOCK'), [holdings]);
  const monthlyFlow    = useMemo(() => buildMonthlyFlow(trades),                   [trades]);
  const taxData        = useMemo(() => computeTax(holdings),                       [holdings]);
  const realizedSummary = useMemo(() => computeRealizedSummary(holdings),          [holdings]);
  // Portfolio XIRR is expensive — only compute when trades exist
  const portfolioXIRR  = useMemo(() => {
    if (trades.length < 2) return null;
    return computePortfolioXIRR(trades, currentPrices);
  }, [trades, currentPrices]);

  // ── Add trade ─────────────────────────────────────────────────────────────
  async function addTrade(trade) {
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...trade, portfolioId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const { trade: newTrade } = await res.json();
      setTrades(prev => [...prev, newTrade].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)));

      if (!currentPrices[newTrade.symbol]) {
        const pr = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [newTrade.symbol], cacheOnly: true }),
        });
        if (pr.ok) {
          const prData = await pr.json();
          setCurrentPrices(p => ({ ...p, ...prData.prices }));
          setPriceMeta(p => ({ ...p, ...(prData.meta || {}) }));
        }
      }
      toast('Trade recorded ✓', 'green');
    } catch (err) {
      toast(err.message, 'red');
    }
  }

  // ── Delete trade ──────────────────────────────────────────────────────────
  async function deleteTrade(id) {
    try {
      const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setTrades(prev => prev.filter(t => t.id !== id));
      toast('Trade deleted', 'blue');
    } catch (err) {
      toast(err.message, 'red');
    }
  }

  // ── Save snapshot ─────────────────────────────────────────────────────────
  async function saveSnapshot() {
    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId,
          totalValue:          stats.totalValue,
          totalInvested:       stats.totalInvested,
          totalGain:           stats.totalGain,
          totalRealizedGain:   stats.totalRealizedGain,
          totalReturnPct:      stats.totalReturnPct,
          mfCagr:              stats.mfCagr,
          mfInvested:          stats.mfInvested,
          stInvested:          stats.stInvested,
          fundCount:           stats.fundCount,
          stockCount:          stats.stockCount,
        }),
      });
      if (!res.ok) throw new Error('Snapshot failed');
      toast('Snapshot saved 📸', 'green');
    } catch (err) {
      toast(err.message, 'red');
    }
  }

  // ── Update single symbol price ────────────────────────────────────────────
  async function updatePrice(symbol, price) {
    try {
      const res = await fetch('/api/prices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, price }),
      });
      if (!res.ok) throw new Error('Price update failed');
      setCurrentPrices(p => ({ ...p, [symbol]: parseFloat(price) }));
      const data = await res.json();
      setPriceMeta(p => ({ ...p, ...(data.meta || {}) }));
      toast(`${symbol} price updated ✓`, 'green');
    } catch (err) {
      toast(err.message, 'red');
    }
  }

  // ── Refresh prices ────────────────────────────────────────────────────────
  async function refreshPrices() {
    const symbols = [...new Set(trades.map(t => t.symbol))];
    if (!symbols.length) return;
    try {
      const res = await fetch('/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, force: true }),
      });
      if (res.ok) {
        const priceData = await res.json();
        setCurrentPrices(priceData.prices || {});
        setPriceMeta(priceData.meta || {});
        toast('Prices refreshed ✓', 'green');
      }
    } catch (err) { toast(err.message, 'red'); }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function toast(msg, type = 'blue') {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }

  return (
    <PortfolioCtx.Provider value={{
      trades, holdings, stats, mfHoldings, stHoldings,
      monthlyFlow, taxData, currentPrices, priceMeta,
      realizedSummary, portfolioXIRR,
      portfolioId, loading, error,
      activeView, setActiveView,
      addTrade, deleteTrade, saveSnapshot, refreshPrices, updatePrice,
      refreshData: loadData, toasts, toast,
    }}>
      {children}
    </PortfolioCtx.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioCtx);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}
