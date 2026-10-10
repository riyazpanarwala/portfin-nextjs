'use client';

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useTransition,
  useRef,
} from 'react';
import {
  computeHoldings,
  computePortfolioStats,
  buildMonthlyFlow,
  computeTax,
  computeRealizedSummary,
  computePortfolioXIRR,
} from '@/lib/store';
import { useAuth } from '@/context/AuthContext';
import { loadTradeHistory } from '@/lib/loadTradeHistory';

const PortfolioCtx = createContext(null);
const PORTFOLIO_BETA_CACHE_KEY = 'portfin:portfolio-beta:v1';
const ACTIVE_QTY_EPSILON = 1e-6;

// All valid view IDs — used to validate the URL hash on load
const VALID_VIEWS = new Set([
  'overview', 'mf', 'stocks', 'analytics', 'timeline', 'goal',
  'waterfall', 'action', 'snapshots', 'rebalancer', 'vs-nifty',
  'ai-advisor', 'instruments', 'backfill', 'trade', 'tax',
]);

function getViewFromHash() {
  if (typeof window === 'undefined') return 'overview';
  const hash = window.location.hash.replace('#', '').trim();
  return VALID_VIEWS.has(hash) ? hash : 'overview';
}

function portfolioBetaCacheSignature(holdings) {
  return holdings
    .map(h => `${h.symbol}:${h.assetType}:${Number(h.qty || 0).toFixed(6)}`)
    .sort()
    .join('|');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── Initial price-refresh state ───────────────────────────────────────────────
const REFRESH_IDLE = {
  active:    false,
  progress:  0,
  current:   '',
  updated:   0,
  failed:    0,
  total:     0,
  assetType: null,
  done:      false,
  error:     null,
};

export function PortfolioProvider({ children }) {
  // Get authenticated user from AuthContext
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [trades, setTrades]               = useState([]);
  const [corporateActions, setCorporateActions] = useState([]);
  const loadController = useRef(null);
  const [portfolioId, setPortfolioId]     = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});
  const [priceMeta, setPriceMeta]         = useState({});
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [toasts, setToasts]               = useState([]);

  const [portfolioXIRR, setPortfolioXIRR] = useState(null);
  const [portfolioBeta, setPortfolioBeta] = useState(null);
  const [, startXIRRTransition]           = useTransition();

  // ── Price-refresh overlay state ───────────────────────────────────────────
  const [priceRefreshState, setPriceRefreshState] = useState(REFRESH_IDLE);

  // ── Privacy / Discreet Mode State ───────────────────────────────────────────
  const [isDiscreet, setIsDiscreet] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('portfin:discreet') === 'true';
    }
    return false;
  });

  const toggleDiscreet = useCallback(() => {
    setIsDiscreet(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('portfin:discreet', String(next));
      }
      return next;
    });
  }, []);

  // ── URL hash-based view persistence ──────────────────────────────────────
  const [activeView, setActiveViewState] = useState(() => getViewFromHash());

  const setActiveView = useCallback((view) => {
    setActiveViewState(view);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${view}`);
    }
  }, []);

  useEffect(() => {
    function onHashChange() {
      setActiveViewState(getViewFromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // ── Reset state when user logs out ────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      const timerId = setTimeout(() => {
        setTrades([]);
        setCorporateActions([]);
        setPortfolioId(null);
        setCurrentPrices({});
        setPriceMeta({});
        setPortfolioXIRR(null);
        setPortfolioBeta(null);
        setLoading(false);
        setError(null);
      }, 0);
      return () => clearTimeout(timerId);
    }
  }, [userId]);

  // ── Load portfolio + trades ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!userId) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;

    try {
      setLoading(true);
      setError(null);

      let pfRes = await fetch('/api/portfolio', { signal: controller.signal });
      if (!pfRes.ok) throw new Error(await pfRes.text());
      let pfData = await pfRes.json();

      let pid = pfData.portfolios?.[0]?.id;
      if (!pid) {
        const cr = await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
          signal: controller.signal,
        });
        if (!cr.ok) throw new Error(await cr.text());
        pid = (await cr.json()).portfolio.id;
      }
      const { trades: rawTrades, corporateActions: actions } = await loadTradeHistory(pid, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPortfolioId(pid);
      setTrades(rawTrades || []);
      setCorporateActions(actions);

      const instrumentIds = [...new Set((rawTrades || []).map(t => t.instrumentId))];
      setCurrentPrices({});
      setPriceMeta({});
      if (instrumentIds.length > 0) {
        const priceData = await fetchPriceBatches(instrumentIds, { cacheOnly: true }, controller.signal)
          .catch(err => { if (err.name !== 'AbortError') console.warn('[prices]', err.message); return null; });
        if (priceData) {
          if (controller.signal.aborted) return;
          setCurrentPrices(priceData.prices || {});
          setPriceMeta(priceData.meta || {});

          const missing = instrumentIds.filter(id => !priceData.prices?.[id] || priceData.meta?.[id]?.stale);
          if (missing.length > 0) {
            fetchPriceBatches(missing, { force: false }, controller.signal)
              .then(data => {
                if (data?.prices && !controller.signal.aborted) {
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
      if (!controller.signal.aborted) setError(err.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const timeoutId = setTimeout(() => {
      loadData();
    }, 0);
    return () => { clearTimeout(timeoutId); loadController.current?.abort(); };
  }, [loadData, userId]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const holdings = useMemo(
    () => computeHoldings(trades, currentPrices, { corporateActions }).map(h => ({ ...h, priceStale: !priceMeta[h.instrumentId || h.symbol]?.asOf || !!priceMeta[h.instrumentId || h.symbol]?.stale })),
    [trades, currentPrices, corporateActions, priceMeta],
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
      const timeoutId = setTimeout(() => setPortfolioXIRR(null), 0);
      return () => clearTimeout(timeoutId);
    }
    const timeoutId = setTimeout(() => {
      const xirr = computePortfolioXIRR(trades, currentPrices, holdings);
      startXIRRTransition(() => { setPortfolioXIRR(xirr); });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [trades, currentPrices, holdings, startXIRRTransition]);

  // ── Portfolio beta ────────────────────────────────────────────────────────
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

  // ── Stable price-merge helpers ────────────────────────────────────────────
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
  async function addTrade(trade, { idempotencyKey = crypto.randomUUID() } = {}) {
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ ...trade, portfolioId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const { trade: newTrade } = await res.json();
      setTrades(prev =>
        [...prev.filter(t => t.id !== newTrade.id), newTrade].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
      );

      if (!currentPrices[newTrade.instrumentId]) {
        const pr = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instrumentIds: [newTrade.instrumentId], cacheOnly: true }),
        }).catch(() => null);
        if (pr?.ok) {
          const prData = await pr.json().catch(() => null);
          if (!prData) return newTrade;
          mergePrices(prData.prices);
          mergeMeta(prData.meta);
        }
      }
      toast('Trade recorded ✓', 'green');
      return newTrade;
    } catch (err) {
      toast(err.message, 'red');
      throw err;
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
      if (!res.ok) throw new Error((await res.json()).error || 'Snapshot failed');
      const data = await res.json();

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

  // ── Update single instrument price ────────────────────────────────────────
  async function updatePrice(instrumentId, symbol, price) {
    try {
      const res = await fetch('/api/prices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instrumentId, price }),
      });
      if (!res.ok) throw new Error('Price update failed');
      const data = await res.json();
      mergePrices(data.prices);
      mergeMeta(data.meta);
      toast(`${symbol} price updated ✓`, 'green');
    } catch (err) {
      toast(err.message, 'red');
      throw err;
    }
  }

  // ── Refresh prices ────────────────────────────────────────────────────────
  async function refreshPrices(assetTypeFilter = null) {
    const activeInstruments = holdings
        .filter(h =>
          h.qty > ACTIVE_QTY_EPSILON &&
          (!assetTypeFilter || h.assetType === assetTypeFilter)
        )
        .map(h => ({ instrumentId: h.instrumentId, symbol: h.symbol }));

    const label = assetTypeFilter === 'MF'    ? 'MF NAVs'
                : assetTypeFilter === 'STOCK' ? 'stock prices'
                : 'all prices';

    if (!activeInstruments.length) {
      toast(`No active ${label} to refresh`, 'blue');
      return;
    }

    const CHUNK      = 20;
    const STAGGER_MS = 300;
    const total      = activeInstruments.length;

    setPriceRefreshState({
      active:    true,
      progress:  0,
      current:   '',
      updated:   0,
      failed:    0,
      total,
      assetType: assetTypeFilter,
      done:      false,
      error:     null,
    });

    const allPrices = {};
    const allMeta   = {};
    let updatedCount = 0;
    let failedCount  = 0;
    let processed    = 0;

    for (let i = 0; i < activeInstruments.length; i += CHUNK) {
      const chunk = activeInstruments.slice(i, i + CHUNK);

      setPriceRefreshState(prev => ({
        ...prev,
        current:  chunk[0].symbol,
        progress: Math.round((processed / total) * 100),
      }));

      try {
        const res = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instrumentIds: chunk.map(h => h.instrumentId), force: true }),
        });
        if (res.ok) {
          const priceData = await res.json();
          Object.assign(allPrices, priceData.prices  || {});
          Object.assign(allMeta,   priceData.meta    || {});
          updatedCount += chunk.filter(h => ['yahoo', 'amfi'].includes(priceData.meta?.[h.instrumentId]?.source) && !priceData.meta?.[h.instrumentId]?.stale).length;
          failedCount += chunk.filter(h => !['yahoo', 'amfi'].includes(priceData.meta?.[h.instrumentId]?.source) || priceData.meta?.[h.instrumentId]?.stale).length;
        } else {
          failedCount += chunk.length;
        }
      } catch {
        failedCount += chunk.length;
      }

      processed += chunk.length;
      setPriceRefreshState(prev => ({
        ...prev,
        progress: Math.round((processed / total) * 100),
        updated:  updatedCount,
        failed:   failedCount,
      }));

      if (i + CHUNK < activeInstruments.length) {
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

    setPriceRefreshState(prev => ({
      ...prev,
      active:   true,
      progress: 100,
      current:  '',
      done:     true,
      updated:  updatedCount,
      failed:   failedCount,
    }));

    setTimeout(() => {
      setPriceRefreshState(REFRESH_IDLE);
    }, 2500);

    if (updatedCount > 0 && failedCount === 0) {
      toast(`${label} refreshed ✓ — ${updatedCount} updated`, 'green');
    } else if (updatedCount > 0) {
      toast(`${label} refreshed — ${updatedCount} updated, ${failedCount} failed`, 'blue');
    } else {
      toast(`Price refresh failed — check network`, 'red');
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
      trades, corporateActions, holdings, stats, mfHoldings, stHoldings,
      monthlyFlow, taxData, currentPrices, priceMeta,
      realizedSummary, portfolioXIRR, portfolioBeta,
      portfolioId, loading, error,
      activeView, setActiveView,
      isDiscreet, toggleDiscreet,
      addTrade, deleteTrade, saveSnapshot, refreshPrices, updatePrice, mergePrices, mergeMeta,
      priceRefreshState,
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

async function fetchPriceBatches(instrumentIds, options, signal) {
  const result = { prices: {}, meta: {} };
  for (let offset = 0; offset < instrumentIds.length; offset += 100) {
    const response = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instrumentIds: instrumentIds.slice(offset, offset + 100), ...options }), signal });
    if (!response.ok) throw new Error("Price loading failed");
    const data = await response.json();
    Object.assign(result.prices, data.prices); Object.assign(result.meta, data.meta);
  }
  return result;
}
