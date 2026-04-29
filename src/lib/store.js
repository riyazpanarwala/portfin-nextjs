'use client';

// ─── Business logic ───────────────────────────────────────────────────────────

/**
 * trades: flat objects from API (already joined with instrument)
 * Fields: id, symbol, name, assetType, exchange, sector, tradeType,
 *         quantity (string), price (string), tradeDate (YYYY-MM-DD)
 * currentPrices: { [symbol]: number }
 */
export function computeHoldings(trades, currentPrices = {}) {
  const map = {};

  for (const t of trades) {
    const key = t.symbol;
    if (!map[key]) {
      map[key] = {
        symbol:    t.symbol,
        name:      t.name || t.symbol,
        assetType: t.assetType,
        exchange:  t.exchange,
        sector:    t.sector || 'Other',
        lots:      [],
        qty:       0,
        invested:  0,
      };
    }
    const h   = map[key];
    const qty   = parseFloat(t.quantity);
    const price = parseFloat(t.price);

    if (t.tradeType === 'BUY') {
      h.qty      += qty;
      h.invested += qty * price;
      h.lots.push({ date: t.tradeDate, qty, price });
    } else {
      const avgBuy = h.qty > 0 ? h.invested / h.qty : price;
      h.qty      -= qty;
      h.invested -= qty * avgBuy;
    }
  }

  return Object.values(map)
    .filter(h => h.qty > 0.0001)
    .map(h => {
      const cmp         = currentPrices[h.symbol] ? parseFloat(currentPrices[h.symbol]) : (h.qty > 0 ? h.invested / h.qty : 0);
      const marketValue = h.qty * cmp;
      const gain        = marketValue - h.invested;
      const returnPct   = h.invested > 0 ? (gain / h.invested) * 100 : 0;
      const avgBuy      = h.qty > 0 ? h.invested / h.qty : 0;

      const firstDate   = h.lots.length ? new Date(h.lots[0].date) : new Date();
      const years       = Math.max(0.1, (Date.now() - firstDate.getTime()) / (365.25 * 24 * 3600 * 1000));
      const cagr        = h.invested > 0 && marketValue > 0
        ? (Math.pow(marketValue / h.invested, 1 / years) - 1) * 100 : 0;
      const holdingDays = Math.round((Date.now() - firstDate.getTime()) / (24 * 3600 * 1000));

      return { ...h, cmp, marketValue, gain, returnPct, avgBuy, cagr, holdingDays, years };
    });
}

export function computePortfolioStats(holdings) {
  const totalValue    = holdings.reduce((s, h) => s + h.marketValue, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totalGain     = totalValue - totalInvested;
  const totalReturnPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const mfH = holdings.filter(h => h.assetType === 'MF');
  const stH = holdings.filter(h => h.assetType === 'STOCK');

  const mfValue    = mfH.reduce((s, h) => s + h.marketValue, 0);
  const stValue    = stH.reduce((s, h) => s + h.marketValue, 0);
  const mfInvested = mfH.reduce((s, h) => s + h.invested, 0);
  const stInvested = stH.reduce((s, h) => s + h.invested, 0);

  const mfCagr = mfInvested > 0
    ? mfH.reduce((s, h) => s + h.cagr * h.invested, 0) / mfInvested : 0;

  const allYears = totalInvested > 0
    ? holdings.reduce((s, h) => s + h.years * h.invested, 0) / totalInvested : 1;
  const overallCagr = totalInvested > 0 && totalValue > 0
    ? (Math.pow(totalValue / totalInvested, 1 / Math.max(0.1, allYears)) - 1) * 100 : 0;

  return {
    totalValue, totalInvested, totalGain, totalReturnPct,
    mfValue, stValue, mfInvested, stInvested,
    mfCagr, overallCagr,
    fundCount:  mfH.length,
    stockCount: stH.length,
    mfPct: totalValue > 0 ? (mfValue / totalValue) * 100 : 0,
    stPct: totalValue > 0 ? (stValue / totalValue) * 100 : 0,
  };
}

export function buildMonthlyFlow(trades) {
  const map = {};
  for (const t of trades) {
    if (t.tradeType !== 'BUY') continue;
    const key = (t.tradeDate || '').slice(0, 7);
    if (!key) continue;
    map[key] = (map[key] || 0) + parseFloat(t.quantity) * parseFloat(t.price);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));
}

export function computeTax(holdings) {
  return holdings.map(h => {
    const isLTCG      = h.years >= 1;
    const taxRate     = isLTCG ? 0.125 : 0.20;
    const taxableGain = Math.max(0, h.gain);
    const exemption   = isLTCG ? 125000 : 0;
    const tax         = taxableGain > exemption ? (taxableGain - exemption) * taxRate : 0;
    return { ...h, isLTCG, taxRate, taxableGain, tax };
  });
}

export function projectWealth(sipMonthly, years, annualReturn, stepUpPct = 0) {
  const data = [];
  let corpus = 0, sip = sipMonthly, totalInvested = 0;
  for (let y = 0; y <= years; y++) {
    if (y > 0) {
      for (let m = 0; m < 12; m++) { corpus = corpus * (1 + annualReturn / 12) + sip; totalInvested += sip; }
      sip *= (1 + stepUpPct / 100);
    }
    data.push({ year: y, corpus: Math.round(corpus), invested: Math.round(totalInvested), gain: Math.round(corpus - totalInvested) });
  }
  return data;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function fmtCr(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return sign + '₹' + fmt(abs / 1e7) + 'Cr';
  if (abs >= 1e5) return sign + '₹' + fmt(abs / 1e5) + 'L';
  return sign + '₹' + fmt(abs, 0);
}
export function fmtPct(n, sign = true) {
  if (n == null || isNaN(n)) return '—';
  return (sign && n > 0 ? '+' : '') + fmt(n) + '%';
}
export function colorPnl(n) { return n > 0 ? 'var(--green2)' : n < 0 ? 'var(--red2)' : 'var(--text2)'; }
export function chipPnl(n)  { return n > 0 ? 'chip chip-green' : n < 0 ? 'chip chip-red' : 'chip'; }

// ─── Sector colours ───────────────────────────────────────────────────────────
export const SECTOR_COLORS = {
  'Large Cap': '#38bdf8', 'Small Cap': '#e879f9', 'Mid Cap': '#fbbf24',
  'Flexi Cap': '#4ade80', 'ELSS': '#fb923c', 'Value': '#a78bfa',
  'Diversified': '#60a5fa', 'Energy': '#f59e0b', 'Power': '#22d3ee',
  'Renewable Energy': '#86efac', 'Defence': '#c4b5fd', 'Finance': '#34d399',
  'FMCG': '#fca5a5', 'Metals & Mining': '#e2e8f0', 'Mining': '#94a3b8',
  'Construction': '#f97316', 'IT': '#60a5fa', 'Banking': '#10b981',
  'Bonds': '#fbbf24', 'Index ETF': '#38bdf8', 'Defence ETF': '#c4b5fd',
  'Commodities ETF': '#d1d5db', 'Other': '#64748b',
};
export function sectorColor(s) { return SECTOR_COLORS[s] || SECTOR_COLORS.Other; }
