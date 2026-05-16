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
const PORTFOLIO_BETA_CACHE_KEY = 'portfin:portfolio-beta:v1';

function portfolioBetaCacheSignature(holdings) {
  return holdings
    .map(h => `${h.symbol}:${h.assetType}:${Number(h.qty || 0).toFixed(6)}`)
    .sort()
    .join('|');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function PortfolioProvider({ children }) {
  const [trades, setTrades]               = useState([]);
  const [portfolioId, setPortfolioId]     = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});
  const [priceMeta, setPriceMeta]         = useState({});
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [activeView, setActiveView]       = useState('overview');
  const [toasts, setToasts]               = useState([]);

  const [portfolioXIRR, setPortfolioXIRR] = useState(null);
  const [portfolioBeta, setPortfolioBeta] = useState(null);
  const [, startXIRRTransition]           = useTransition();

  // ── Load portfolio + trades ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

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

      const tRes = await fetch(`/api/trades?portfolioId=${pid}`);
      if (!tRes.ok) throw new Error(await tRes.text());
      const { trades: rawTrades } = await tRes.json();
      setTrades(rawTrades || []);

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
              .catch(() => { });
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

  const mfHoldings  = useMemo(() => holdings.filter(h => h.assetType === 'MF'),    [holdings]);
  const stHoldings  = useMemo(() => holdings.filter(h => h.assetType === 'STOCK'), [holdings]);
  const monthlyFlow = useMemo(() => buildMonthlyFlow(trades),                       [trades]);
  const taxData     = useMemo(() => computeTax(holdings),                           [holdings]);

  const realizedSummary = useMemo(
    () => computeRealizedSummary(holdings),
    [holdings],
  );

  useEffect(() => {
    if (trades.length < 2) {
      setPortfolioXIRR(null);
      return;
    }
    const timeoutId = setTimeout(() => {
      const xirr = computePortfolioXIRR(trades, currentPrices, holdings);
      startXIRRTransition(() => { setPortfolioXIRR(xirr); });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [trades, currentPrices, holdings, startXIRRTransition]);

  // ── Stable price-merge helpers ────────────────────────────────────────────
  useEffect(() => {
    const activeHoldings = holdings.filter(h => h.qty > 0 && h.marketValue > 0);
    if (!activeHoldings.length) {
      const timeoutId = setTimeout(() => setPortfolioBeta(null), 0);
      return () => clearTimeout(timeoutId);
    }

    const cacheDate = todayKey();
    const cacheSignature = portfolioBetaCacheSignature(activeHoldings);
    try {
      const cached = JSON.parse(localStorage.getItem(PORTFOLIO_BETA_CACHE_KEY) || 'null');
      if (
        cached?.date === cacheDate &&
        cached?.signature === cacheSignature &&
        cached?.data
      ) {
        const timeoutId = setTimeout(() => setPortfolioBeta(cached.data), 0);
        return () => clearTimeout(timeoutId);
      }
    } catch {
      localStorage.removeItem(PORTFOLIO_BETA_CACHE_KEY);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch('/api/portfolio-beta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            holdings: activeHoldings.map(h => ({
              symbol: h.symbol,
              assetType: h.assetType,
              marketValue: h.marketValue,
            })),
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Portfolio beta fetch failed');
        const data = await res.json();
        setPortfolioBeta(data);
        localStorage.setItem(
          PORTFOLIO_BETA_CACHE_KEY,
          JSON.stringify({ date: cacheDate, signature: cacheSignature, data }),
        );
      } catch (err) {
        if (err.name !== 'AbortError') setPortfolioBeta(null);
      }
    }, 0);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [holdings]);

  function mergePrices(next = {}) {
    setCurrentPrices(prev => {
      const changed = Object.keys(next).some(k => prev[k] !== next[k]);
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
          stCagr:            stats.stCagr,
          mfInvested:        stats.mfInvested,
          stInvested:        stats.stInvested,
          fundCount:         stats.fundCount,
          stockCount:        stats.stockCount,
        }),
      });
      if (!res.ok) throw new Error('Snapshot failed');
      const data = await res.json();

      // FIX (Bug 18): show a distinct, accurate message when the save within
      // the same minute updated an existing entry rather than creating a new one.
      if (data.duplicateMinute) {
        toast('Snapshot updated (same minute — save again in a new minute for a fresh entry) 📸', 'blue');
      } else if (data.created) {
        toast('Snapshot saved 📸', 'green');
      } else {
        toast('Snapshot updated 📸', 'blue');
      }
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
  async function refreshPrices() {
    const symbols = [...new Set(trades.map(t => t.symbol))];
    if (!symbols.length) return;

    const CHUNK      = 20;
    const STAGGER_MS = 300;

    const allPrices = {};
    const allMeta   = {};
    let updatedCount = 0;
    let failedCount  = 0;

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
          Object.assign(allPrices, priceData.prices  || {});
          Object.assign(allMeta,   priceData.meta    || {});
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

    if (Object.keys(allPrices).length > 0) {
      setCurrentPrices(prev => {
        const changed = Object.keys(allPrices).some(k => prev[k] !== allPrices[k]);
        return changed ? { ...prev, ...allPrices } : prev;
      });
      setPriceMeta(prev => ({ ...prev, ...allMeta }));
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
      realizedSummary, portfolioXIRR, portfolioBeta,
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
