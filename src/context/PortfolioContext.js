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
  const [trades, setTrades] = useState([]);
  const [portfolioId, setPortfolioId] = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});
  const [priceMeta, setPriceMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState('overview');
  const [toasts, setToasts] = useState([]);

  const [portfolioXIRR, setPortfolioXIRR] = useState(null);
  const [, startXIRRTransition] = useTransition();

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

      // 3. Fetch current prices (cache-only on initial load for fast paint)
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

          // FIX (high): background-fetch any symbols with no cached price at
          // all (e.g. newly added instruments).  Without this they silently
          // fall back to avgBuy as CMP indefinitely until the user manually
          // clicks "Prices".
          const missing = symbols.filter(s => !priceData.prices?.[s]);
          if (missing.length > 0) {
            fetch('/api/prices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols: missing, force: false }),
            })
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data?.prices) {
                  setCurrentPrices(prev => {
                    const changed = Object.keys(data.prices).some(
                      k => prev[k] !== data.prices[k]
                    );
                    return changed ? { ...prev, ...data.prices } : prev;
                  });
                  setPriceMeta(prev => ({ ...prev, ...(data.meta || {}) }));
                }
              })
              .catch(() => { /* best-effort */ });
          }
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
  const holdings = useMemo(
    () => computeHoldings(trades, currentPrices),
    [trades, currentPrices],
  );

  const stats = useMemo(
    () => computePortfolioStats(holdings),
    [holdings],
  );

  const mfHoldings = useMemo(() => holdings.filter(h => h.assetType === 'MF'), [holdings]);
  const stHoldings = useMemo(() => holdings.filter(h => h.assetType === 'STOCK'), [holdings]);
  const monthlyFlow = useMemo(() => buildMonthlyFlow(trades), [trades]);
  const taxData = useMemo(() => computeTax(holdings), [holdings]);

  const realizedSummary = useMemo(
    () => computeRealizedSummary(holdings),
    [holdings],
  );

  // Pass pre-computed holdings so computePortfolioXIRR never calls
  // computeHoldings a second time; run in a low-priority transition.
  useEffect(() => {
    if (trades.length < 2) {
      setPortfolioXIRR(null);
      return;
    }
    const timeoutId = setTimeout(() => {
      const xirr = computePortfolioXIRR(
        trades,
        currentPrices,
        holdings,
      );

      startXIRRTransition(() => {
        setPortfolioXIRR(xirr);
      });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [trades, currentPrices, holdings, startXIRRTransition]);

  // ── Stable price-merge helpers ────────────────────────────────────────────
  // Only trigger re-renders when prices actually changed.
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
  // FIX: now sends totalRealizedGain so the API can persist it to the new
  // schema column (was silently dropped before, causing "—" in snapshot table).
  // Also reads the `created` flag from the API to show the right toast.
  async function saveSnapshot() {
    try {
      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId,
          totalValue: stats.totalValue,
          totalInvested: stats.totalInvested,
          totalGain: stats.totalGain,
          totalRealizedGain: stats.totalRealizedGain,   // FIX: was missing
          totalReturnPct: stats.totalReturnPct,
          mfCagr: stats.mfCagr,
          mfInvested: stats.mfInvested,
          stInvested: stats.stInvested,
          fundCount: stats.fundCount,
          stockCount: stats.stockCount,
        }),
      });
      if (!res.ok) throw new Error('Snapshot failed');
      const data = await res.json();
      // FIX: show "updated" when the same-minute upsert hit an existing row
      toast(data.created ? 'Snapshot saved 📸' : 'Snapshot updated 📸', 'green');
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
      mergePrices({ [symbol]: parseFloat(price) });
      const data = await res.json();
      mergeMeta(data.meta);
      toast(`${symbol} price updated ✓`, 'green');
    } catch (err) {
      toast(err.message, 'red');
    }
  }

  // ── Refresh prices ────────────────────────────────────────────────────────
  // FIX (high): was firing one concurrent Yahoo request per symbol simultaneously
  // (30+ at once), hitting rate limits and silently failing most of them while
  // showing a success toast.  Now sends symbols in chunks of 20 with a small
  // stagger between chunks — matching what updatePrices.js already does.
  async function refreshPrices() {
    const symbols = [...new Set(trades.map(t => t.symbol))];
    if (!symbols.length) return;

    const CHUNK = 20;
    const STAGGER_MS = 300;
    let updatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < symbols.length; i += CHUNK) {
      const chunk = symbols.slice(i, i + CHUNK);
      try {
        const res = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: chunk, force: true }),
        });
        if (res.ok) {
          const priceData = await res.json();
          mergePrices(priceData.prices);
          mergeMeta(priceData.meta || {});
          updatedCount += Object.keys(priceData.prices || {}).length;
        } else {
          failedCount += chunk.length;
        }
      } catch {
        failedCount += chunk.length;
      }

      if (i + CHUNK < symbols.length) {
        await new Promise(r => setTimeout(r, STAGGER_MS));
      }
    }

    if (updatedCount > 0 && failedCount === 0) {
      toast(`Prices refreshed ✓ (${updatedCount} symbols)`, 'green');
    } else if (updatedCount > 0) {
      toast(`Prices refreshed — ${updatedCount} updated, ${failedCount} failed`, 'blue');
    } else {
      toast('Price refresh failed — check network', 'red');
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
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
