'use client';

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION PORTFOLIO ENGINE
// ─────────────────────────────────────────────────────────────────────────────
// Key design decisions:
//   • FIFO sell matching — oldest lots consumed first
//   • realizedGain tracked separately from unrealizedGain
//   • lots[] on the returned holding = REMAINING lots only (UI compat)
//   • Invested = sum of remaining FIFO lot costs (not avg-price approximation)
//   • All qty comparisons use EPSILON guard for float safety
// ─────────────────────────────────────────────────────────────────────────────

const EPSILON = 1e-6; // floating-point guard

// ─── FIFO Engine ─────────────────────────────────────────────────────────────

/**
 * computeHoldings
 *
 * @param {Array}  trades        - flat trade objects from API, sorted asc by tradeDate
 * @param {Object} currentPrices - { [symbol]: number }
 * @returns {Array} holdings     - one object per symbol with remaining position
 *
 * Returned shape (fully compatible with existing UI):
 * {
 *   symbol, name, assetType, exchange, sector,
 *   qty, invested, avgBuy,
 *   cmp, marketValue,
 *   unrealizedGain, realizedGain, totalGain,
 *   returnPct,          // based on totalGain / (invested + realizedCost)
 *   unrealizedReturnPct,
 *   cagr, holdingDays, years,
 *   lots: [{ date, qty, price }],   // ← REMAINING lots only (XIRR-safe)
 *   sells: [{
 *     date, qty, sellPrice, realized, taxType,
 *     matchedLots: [{ buyDate, qty, buyPrice, holdDays }]
 *   }],
 *   stats: { trades, buyTrades, sellTrades, winCount, lossCount, totalSellProceeds }
 * }
 */
export function computeHoldings(trades, currentPrices = {}) {
  // ── 1. Group & sort trades by symbol ───────────────────────────────────────
  const bySymbol = {};

  for (const t of trades) {
    const key = t.symbol;
    if (!bySymbol[key]) bySymbol[key] = { meta: t, buys: [], sells: [] };
    if (t.tradeType === 'BUY')  bySymbol[key].buys.push(t);
    else                        bySymbol[key].sells.push(t);
  }

  const holdings = [];

  for (const [symbol, { meta, buys, sells }] of Object.entries(bySymbol)) {
    // ── 2. Build FIFO lot queue from BUYs (chronological) ────────────────────
    // Each lot: { date, qty, price, remaining }
    const lotQueue = buys
      .slice()
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
      .map(t => ({
        date:      t.tradeDate,
        qty:       parseFloat(t.quantity),
        price:     parseFloat(t.price),
        remaining: parseFloat(t.quantity),   // mutable during FIFO matching
      }));

    // ── 3. Process SELLs in chronological order — FIFO match ─────────────────
    const sellRecords = [];
    let realizedGain  = 0;

    const sortedSells = sells
      .slice()
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

    for (const sellTrade of sortedSells) {
      let sellQtyLeft   = parseFloat(sellTrade.quantity);
      const sellPrice   = parseFloat(sellTrade.price);
      const sellDate    = sellTrade.tradeDate;
      const matchedLots = [];

      for (const lot of lotQueue) {
        if (sellQtyLeft <= EPSILON) break;
        if (lot.remaining <= EPSILON) continue;

        const consumed = Math.min(lot.remaining, sellQtyLeft);
        const costBasis = consumed * lot.price;
        const proceeds  = consumed * sellPrice;
        const lotGain   = proceeds - costBasis;

        const holdDays  = daysBetween(lot.date, sellDate);
        const taxType   = holdDays >= 365 ? 'LTCG' : 'STCG';

        matchedLots.push({
          buyDate:  lot.date,
          qty:      consumed,
          buyPrice: lot.price,
          holdDays,
          taxType,
          costBasis,
          gain:     lotGain,
        });

        lot.remaining  -= consumed;
        sellQtyLeft    -= consumed;
        realizedGain   += lotGain;
      }

      // If sell qty exceeded available lots, clamp silently (data integrity guard)
      const actualQtySold = parseFloat(sellTrade.quantity) - Math.max(0, sellQtyLeft);

      if (actualQtySold > EPSILON) {
        const totalRealized = matchedLots.reduce((s, m) => s + m.gain, 0);
        sellRecords.push({
          date:        sellDate,
          qty:         actualQtySold,
          sellPrice,
          realized:    totalRealized,
          matchedLots,
          // Dominant tax type by qty
          taxType: dominantTaxType(matchedLots),
        });
      }
    }

    // ── 4. Build remaining lots (only those with qty > EPSILON) ───────────────
    const remainingLots = lotQueue
      .filter(l => l.remaining > EPSILON)
      .map(l => ({ date: l.date, qty: l.remaining, price: l.price }));

    // ── 5. Compute position metrics from remaining lots ───────────────────────
    const qty      = remainingLots.reduce((s, l) => s + l.qty, 0);
    const invested = remainingLots.reduce((s, l) => s + l.qty * l.price, 0);

    // If nothing remains, still include if there's realized gain to report
    if (qty <= EPSILON && realizedGain === 0 && sellRecords.length === 0) continue;

    const avgBuy = qty > EPSILON ? invested / qty : 0;

    // CMP: use live price, fallback to avgBuy (avoids 0 market-value distortion)
    const cmp = currentPrices[symbol]
      ? parseFloat(currentPrices[symbol])
      : avgBuy;

    const marketValue     = qty * cmp;
    const unrealizedGain  = marketValue - invested;

    // totalGain = what you've made unrealized + what you've locked in via sells
    const totalGain       = unrealizedGain + realizedGain;

    // returnPct: total gain relative to total capital ever deployed in remaining position
    // (use invested as base; realizedCost already "left" the book)
    const unrealizedReturnPct = invested > EPSILON
      ? (unrealizedGain / invested) * 100 : 0;
    const returnPct = invested > EPSILON
      ? (totalGain / invested) * 100 : 0;

    // ── 6. Time metrics from remaining lots ──────────────────────────────────
    const firstDate   = remainingLots.length > 0
      ? new Date(remainingLots[0].date)
      : new Date();
    const now         = new Date();
    const holdingDays = Math.max(0, Math.round((now - firstDate) / (24 * 3600 * 1000)));
    const years       = Math.max(0.1, holdingDays / 365.25);

    const cagr = invested > EPSILON && marketValue > 0
      ? (Math.pow(marketValue / invested, 1 / years) - 1) * 100
      : 0;

    // ── 7. Trade stats ────────────────────────────────────────────────────────
    const winCount  = sellRecords.filter(s => s.realized > 0).length;
    const lossCount = sellRecords.filter(s => s.realized < 0).length;
    const totalSellProceeds = sellRecords.reduce((s, sr) => s + sr.qty * sr.sellPrice, 0);

    holdings.push({
      // Identity
      symbol,
      name:      meta.name     || symbol,
      assetType: meta.assetType,
      exchange:  meta.exchange,
      sector:    meta.sector   || 'Other',

      // Position
      qty,
      invested,
      avgBuy,
      lots: remainingLots,   // ← XIRR-safe: only remaining lots

      // Pricing
      cmp,
      marketValue,

      // P&L
      unrealizedGain,
      realizedGain,
      totalGain,

      // Returns
      returnPct,
      unrealizedReturnPct,

      // Time
      cagr,
      holdingDays,
      years,

      // Sell history
      sells: sellRecords,

      // Stats
      stats: {
        trades:            buys.length + sells.length,
        buyTrades:         buys.length,
        sellTrades:        sells.length,
        winCount,
        lossCount,
        totalSellProceeds,
      },
    });
  }

  return holdings.filter(h => h.qty > EPSILON || h.realizedGain !== 0 || h.sells.length > 0);
}

// ─── Portfolio-level stats ────────────────────────────────────────────────────

export function computePortfolioStats(holdings) {
  const active = holdings.filter(h => h.qty > EPSILON);

  const totalValue    = active.reduce((s, h) => s + h.marketValue, 0);
  const totalInvested = active.reduce((s, h) => s + h.invested,    0);
  const totalUnrealizedGain = active.reduce((s, h) => s + h.unrealizedGain, 0);
  const totalRealizedGain   = holdings.reduce((s, h) => s + h.realizedGain, 0);
  const totalGain           = totalUnrealizedGain + totalRealizedGain;
  const totalReturnPct      = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const mfH = active.filter(h => h.assetType === 'MF');
  const stH = active.filter(h => h.assetType === 'STOCK');

  const mfValue    = mfH.reduce((s, h) => s + h.marketValue, 0);
  const stValue    = stH.reduce((s, h) => s + h.marketValue, 0);
  const mfInvested = mfH.reduce((s, h) => s + h.invested,    0);
  const stInvested = stH.reduce((s, h) => s + h.invested,    0);

  const mfCagr = mfInvested > 0
    ? mfH.reduce((s, h) => s + h.cagr * h.invested, 0) / mfInvested
    : 0;

  const allYears = totalInvested > 0
    ? active.reduce((s, h) => s + h.years * h.invested, 0) / totalInvested
    : 1;
  const overallCagr = totalInvested > 0 && totalValue > 0
    ? (Math.pow(totalValue / totalInvested, 1 / Math.max(0.1, allYears)) - 1) * 100
    : 0;

  return {
    totalValue, totalInvested, totalGain,
    totalUnrealizedGain, totalRealizedGain,
    totalReturnPct,
    mfValue, stValue, mfInvested, stInvested,
    mfCagr, overallCagr,
    fundCount:  mfH.length,
    stockCount: stH.length,
    mfPct: totalValue > 0 ? (mfValue / totalValue) * 100 : 0,
    stPct: totalValue > 0 ? (stValue / totalValue) * 100 : 0,
  };
}

// ─── True portfolio XIRR (includes sells) ────────────────────────────────────
// This gives the accurate money-weighted return across ALL cash flows.
//
// Usage:
//   const xirr = computePortfolioXIRR(trades, currentPrices);
//   // Returns annualised return %, e.g. 14.2
//
export function computePortfolioXIRR(trades, currentPrices = {}) {
  // All outflows = BUY payments (negative cash flow)
  // All inflows  = SELL proceeds (positive cash flow)
  // Terminal inflow = current market value of remaining holdings
  const holdings = computeHoldings(trades, currentPrices);

  const cashflows = [];

  // Historical cash flows from trades
  for (const t of trades) {
    const qty   = parseFloat(t.quantity);
    const price = parseFloat(t.price);
    const brokerage = t.brokerage ? parseFloat(t.brokerage) : 0;
    if (t.tradeType === 'BUY') {
      cashflows.push({ date: t.tradeDate, amount: -(qty * price + brokerage) });
    } else {
      cashflows.push({ date: t.tradeDate, amount: qty * price - brokerage });
    }
  }

  // Terminal: today's market value of remaining positions
  const todayStr  = new Date().toISOString().slice(0, 10);
  const termValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  if (termValue > 0) cashflows.push({ date: todayStr, amount: termValue });

  if (cashflows.length < 2) return null;
  cashflows.sort((a, b) => a.date.localeCompare(b.date));

  return newtonXIRR(cashflows);
}

// ─── Realized P&L summary ────────────────────────────────────────────────────

export function computeRealizedSummary(holdings) {
  const sells = holdings.flatMap(h =>
    h.sells.map(s => ({ ...s, symbol: h.symbol, assetType: h.assetType }))
  );

  const ltcgGain = sells
    .filter(s => s.taxType === 'LTCG')
    .reduce((sum, s) => sum + s.realized, 0);

  const stcgGain = sells
    .filter(s => s.taxType === 'STCG')
    .reduce((sum, s) => sum + s.realized, 0);

  // India FY2024+ tax rates
  const ltcgExemption = 125000;
  const ltcgTax = ltcgGain > ltcgExemption ? (ltcgGain - ltcgExemption) * 0.125 : 0;
  const stcgTax = stcgGain > 0 ? stcgGain * 0.20 : 0;

  const totalRealized = ltcgGain + stcgGain;
  const totalTax      = ltcgTax + stcgTax;

  const sellsBySymbol = {};
  for (const s of sells) {
    if (!sellsBySymbol[s.symbol]) sellsBySymbol[s.symbol] = { realized: 0, sells: [] };
    sellsBySymbol[s.symbol].realized += s.realized;
    sellsBySymbol[s.symbol].sells.push(s);
  }

  return {
    totalRealized,
    ltcgGain, stcgGain,
    ltcgTax, stcgTax,
    totalTax,
    sells,
    sellsBySymbol,
  };
}

// ─── Monthly flow (unchanged — used by existing charts) ──────────────────────

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

// ─── Tax computation (existing UI compat — now uses FIFO data when available) ─

export function computeTax(holdings) {
  return holdings.map(h => {
    const isLTCG      = h.years >= 1;
    const taxRate     = isLTCG ? 0.125 : 0.20;
    const taxableGain = Math.max(0, h.unrealizedGain ?? h.gain ?? 0);
    const exemption   = isLTCG ? 125000 : 0;
    const tax         = taxableGain > exemption ? (taxableGain - exemption) * taxRate : 0;
    return { ...h, isLTCG, taxRate, taxableGain, tax };
  });
}

// ─── Wealth projection (unchanged) ───────────────────────────────────────────

export function projectWealth(sipMonthly, years, annualReturn, stepUpPct = 0) {
  const data = [];
  let corpus = 0, sip = sipMonthly, totalInvested = 0;
  for (let y = 0; y <= years; y++) {
    if (y > 0) {
      for (let m = 0; m < 12; m++) {
        corpus = corpus * (1 + annualReturn / 12) + sip;
        totalInvested += sip;
      }
      sip *= (1 + stepUpPct / 100);
    }
    data.push({
      year:      y,
      corpus:    Math.round(corpus),
      invested:  Math.round(totalInvested),
      gain:      Math.round(corpus - totalInvested),
    });
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function daysBetween(dateStrA, dateStrB) {
  return Math.round(
    (new Date(dateStrB) - new Date(dateStrA)) / (24 * 3600 * 1000)
  );
}

function dominantTaxType(matchedLots) {
  if (!matchedLots.length) return 'STCG';
  const ltcgQty  = matchedLots.filter(m => m.taxType === 'LTCG').reduce((s, m) => s + m.qty, 0);
  const stcgQty  = matchedLots.filter(m => m.taxType === 'STCG').reduce((s, m) => s + m.qty, 0);
  return ltcgQty >= stcgQty ? 'LTCG' : 'STCG';
}

// Newton-Raphson XIRR solver
function newtonXIRR(cashflows) {
  const dates   = cashflows.map(c => new Date(c.date));
  const amounts = cashflows.map(c => c.amount);
  const d0      = dates[0];
  const yr      = i => (dates[i] - d0) / (365.25 * 864e5);

  const npv  = r => amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, yr(i)), 0);
  const dnpv = r => amounts.reduce((s, a, i) => s - yr(i) * a / Math.pow(1 + r, yr(i) + 1), 0);

  let rate = 0.1;
  for (let k = 0; k < 200; k++) {
    const f = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(d) < 1e-12) break;
    const nr = rate - f / d;
    if (Math.abs(nr - rate) < 1e-8) { rate = nr; break; }
    rate = Math.max(Math.min(nr, 100), -0.9999); // clamp to [-99.99%, 10000%]
  }
  return isFinite(rate) ? rate * 100 : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTERS (unchanged — keep existing UI working)
// ─────────────────────────────────────────────────────────────────────────────

export function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
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

export function colorPnl(n) {
  return n > 0 ? 'var(--green2)' : n < 0 ? 'var(--red2)' : 'var(--text2)';
}

export function chipPnl(n) {
  return n > 0 ? 'chip chip-green' : n < 0 ? 'chip chip-red' : 'chip';
}

// ─── Sector colours (unchanged) ───────────────────────────────────────────────

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

export function sectorColor(s) {
  return SECTOR_COLORS[s] || SECTOR_COLORS.Other;
}
