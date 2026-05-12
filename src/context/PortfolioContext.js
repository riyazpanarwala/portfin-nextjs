'use client';

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useTransition,
} from 'react';
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

  // FIX 4 — portfolioXIRR is expensive; keep it in state and compute it in a
  // low-priority transition so it never blocks paint / user interactions.
  const [portfolioXIRR, setPortfolioXIRR]   = useState(null);
  const [, startXIRRTransition]             = useTransition();

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
          // Use setter directly on first load — no previous prices to compare
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
  // These memo chains are ordered so each depends only on the previous result,
  // avoiding redundant re-runs when an unrelated piece of state changes.

  const holdings = useMemo(
    () => computeHoldings(trades, currentPrices),
    [trades, currentPrices],
  );

  const stats = useMemo(
    () => computePortfolioStats(holdings),
    [holdings],
  );

  const mfHoldings  = useMemo(() => holdings.filter(h => h.assetType === 'MF'),    [holdings]);
  const stHoldings  = useMemo(() => holdings.filter(h => h.assetType === 'STOCK'), [holdings]);
  const monthlyFlow = useMemo(() => buildMonthlyFlow(trades),                       [trades]);
  const taxData     = useMemo(() => computeTax(holdings),                           [holdings]);

  const realizedSummary = useMemo(
    () => computeRealizedSummary(holdings),
    [holdings],
  );

  // FIX 1 + FIX 4 — pass already-computed `holdings` into computePortfolioXIRR
  // so it never calls computeHoldings a second time; run it in a low-priority
  // transition so Newton-Raphson iterations don't block UI interactions.
  useEffect(() => {
    if (trades.length < 2) {
      setPortfolioXIRR(null);
      return;
    }
    startXIRRTransition(() => {
      setPortfolioXIRR(computePortfolioXIRR(trades, currentPrices, holdings));
    });
  }, [trades, currentPrices, holdings]);

  // ── Stable price-merge helper ─────────────────────────────────────────────
  // FIX 2 — only update currentPrices when values actually changed.
  // This prevents all 6 memo chains from re-running when a refresh returns
  // the same prices (e.g. market closed, cached response).
  function mergePrices(next = {}) {
    setCurrentPrices(prev => {
      const changed = Object.keys(next).some(k => prev[k] !== next[k]) ||
                      Object.keys(prev).some(k => !(k in next));
      return changed ? { ...prev, ...next } : prev;
    });
  }

  function mergeMeta(next = {}) {
    setPriceMeta(prev => ({ ...prev, ...next }));
  }

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
      setTrades(prev =>
        [...prev, newTrade].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
      );

      // Fetch price for the new symbol if we don't have it yet
      if (!currentPrices[newTrade.symbol]) {
        const pr = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [newTrade.symbol], cacheOnly: true }),
        });
        if (pr.ok) {
          const prData = await pr.json();
          mergePrices(prData.prices);
          mergeMeta(prData.meta);
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
          totalValue:        stats.totalValue,
          totalInvested:     stats.totalInvested,
          totalGain:         stats.totalGain,
          totalRealizedGain: stats.totalRealizedGain,
          totalReturnPct:    stats.totalReturnPct,
          mfCagr:            stats.mfCagr,
          mfInvested:        stats.mfInvested,
          stInvested:        stats.stInvested,
          fundCount:         stats.fundCount,
          stockCount:        stats.stockCount,
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
      // FIX 2 — use mergePrices so only a real value change triggers recompute
      mergePrices({ [symbol]: parseFloat(price) });
      const data = await res.json();
      mergeMeta(data.meta);
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
        // FIX 2 — skip recompute if nothing actually changed
        mergePrices(priceData.prices);
        mergeMeta(priceData.meta);
        toast('Prices refreshed ✓', 'green');
      }
    } catch (err) {
      toast(err.message, 'red');
    }
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
