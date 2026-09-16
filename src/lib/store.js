// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION PORTFOLIO ENGINE
// ─────────────────────────────────────────────────────────────────────────────

import { xirr } from './xirr.js';

const EPSILON = 1e-6;

// ─── FIFO Engine ─────────────────────────────────────────────────────────────

export function computeHoldings(trades, currentPrices = {}) {
  const bySymbol = {};

  for (const t of trades) {
    const key = t.symbol;
    if (!bySymbol[key]) bySymbol[key] = { meta: t, buys: [], sells: [] };
    const normDate = (t.tradeDate || '').slice(0, 10);
    const normTrade = { ...t, tradeDate: normDate };
    if (t.tradeType === 'BUY') bySymbol[key].buys.push(normTrade);
    else                       bySymbol[key].sells.push(normTrade);
  }

  const holdings = [];

  for (const [symbol, { meta, buys, sells }] of Object.entries(bySymbol)) {
    const lotQueue = buys
      .slice()
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
      .map(t => ({
        date:      t.tradeDate,
        qty:       parseFloat(t.quantity),
        price:     parseFloat(t.price),
        remaining: parseFloat(t.quantity),
      }));

    const earliestBuyDate = lotQueue.length > 0 ? lotQueue[0].date : null;
    const totalEverInvested = lotQueue.reduce((s, l) => s + l.qty * l.price, 0);

    const sellRecords = [];
    let realizedGain  = 0;
    let unmatchedSellQty = 0;

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

        const consumed  = Math.min(lot.remaining, sellQtyLeft);
        const costBasis = consumed * lot.price;
        const proceeds  = consumed * sellPrice;
        const lotGain   = proceeds - costBasis;
        const holdDays  = daysBetween(lot.date, sellDate);
        const taxType   = holdDays >= 365 ? 'LTCG' : 'STCG';

        matchedLots.push({
          buyDate: lot.date, qty: consumed, buyPrice: lot.price,
          holdDays, taxType, costBasis, gain: lotGain,
        });
        lot.remaining -= consumed;
        sellQtyLeft   -= consumed;
        realizedGain  += lotGain;
      }

      if (sellQtyLeft > EPSILON) {
        unmatchedSellQty += sellQtyLeft;
        console.warn(
          `[portfin] FIFO mismatch for ${symbol}: ${sellQtyLeft.toFixed(4)} units sold ` +
          `on ${sellDate} have no matching buy lots. Realized gain is understated.`
        );
      }

      const actualQtySold = parseFloat(sellTrade.quantity) - Math.max(0, sellQtyLeft);
      if (actualQtySold > EPSILON) {
        sellRecords.push({
          date:        sellDate,
          qty:         actualQtySold,
          sellPrice,
          realized:    matchedLots.reduce((s, m) => s + m.gain, 0),
          matchedLots,
          taxType: dominantTaxType(matchedLots),
        });
      }
    }

    const remainingLots = lotQueue
      .filter(l => l.remaining > EPSILON)
      .map(l => ({ date: l.date, qty: l.remaining, price: l.price }));

    const qty      = remainingLots.reduce((s, l) => s + l.qty, 0);
    const invested = remainingLots.reduce((s, l) => s + l.qty * l.price, 0);

    if (qty <= EPSILON && realizedGain === 0 && sellRecords.length === 0) continue;

    const avgBuy         = qty > EPSILON ? invested / qty : 0;
    const cmp            = currentPrices[symbol] ? parseFloat(currentPrices[symbol]) : avgBuy;
    const marketValue    = qty * cmp;
    const unrealizedGain = marketValue - invested;
    const totalGain      = unrealizedGain + realizedGain;

    const returnPct = totalEverInvested > EPSILON
      ? (totalGain / totalEverInvested) * 100
      : 0;
    const unrealizedReturnPct = invested > EPSILON
      ? (unrealizedGain / invested) * 100
      : 0;
	
	const firstDate = earliestBuyDate ? new Date(earliestBuyDate) : new Date();
	const holdingDays = Math.max(0, Math.round((new Date() - firstDate) / (24 * 3600 * 1000)));
	const years       = Math.max(0.1, holdingDays / 365.25);

	const rawCagr = invested > EPSILON && marketValue > 0
	  ? (Math.pow(marketValue / invested, 1 / years) - 1) * 100
	  : 0;

    // FIX: annualizing returns for very short holding periods (years floored to
	// 0.1, i.e. ~36 days) can blow up to billions of percent for large absolute
	// gains (e.g. a 15x return in 1 month -> 15^10 * 100%). That's mathematically
	// "correct" CAGR but meaningless, breaks the UI layout, and overflows the
	// Decimal(8,2) mfCagr/stCagr snapshot columns when aggregated. Clamp to a
	// display-sane range — CAGR isn't a useful metric beyond this for any holding.
	const CAGR_CAP = 9999.99;
	const cagr = Math.max(-99.99, Math.min(rawCagr, CAGR_CAP));

    const winCount  = sellRecords.filter(s => s.realized > 0).length;
    const lossCount = sellRecords.filter(s => s.realized < 0).length;

    holdings.push({
      symbol,
      name:      meta.name     || symbol,
      assetType: meta.assetType,
      exchange:  meta.exchange,
      sector:    meta.sector   || 'Other',
      qty, invested, avgBuy,
      totalEverInvested,
      lots: remainingLots,
      cmp, marketValue,
      unrealizedGain, realizedGain, totalGain,
      returnPct, unrealizedReturnPct,
      cagr, holdingDays, years,
      sells: sellRecords,
      hasDataError: unmatchedSellQty > EPSILON,
      unmatchedSellQty,
      stats: {
        trades:            buys.length + sells.length,
        buyTrades:         buys.length,
        sellTrades:        sells.length,
        winCount,
        lossCount,
        totalSellProceeds: sellRecords.reduce((s, sr) => s + sr.qty * sr.sellPrice, 0),
      },
    });
  }

  return holdings.filter(h => h.qty > EPSILON || h.realizedGain !== 0 || h.sells.length > 0);
}

// ─── Portfolio-level stats ────────────────────────────────────────────────────

export function computePortfolioStats(holdings) {
  const active = holdings.filter(h => h.qty > EPSILON);

  const totalValue          = active.reduce((s, h) => s + h.marketValue, 0);
  const totalInvested       = active.reduce((s, h) => s + h.invested,    0);
  const totalUnrealizedGain = active.reduce((s, h) => s + h.unrealizedGain, 0);
  const totalRealizedGain   = holdings.reduce((s, h) => s + h.realizedGain, 0);
  const totalGain           = totalUnrealizedGain + totalRealizedGain;

  const totalEverInvested = holdings.reduce(
    (s, h) => s + (h.totalEverInvested ?? h.invested),
    0
  );
  const totalReturnPct = totalEverInvested > EPSILON
    ? (totalGain / totalEverInvested) * 100
    : 0;

  const mfH = active.filter(h => h.assetType === 'MF');
  const stH = active.filter(h => h.assetType === 'STOCK');

  const mfValue    = mfH.reduce((s, h) => s + h.marketValue, 0);
  const stValue    = stH.reduce((s, h) => s + h.marketValue, 0);
  const mfInvested = mfH.reduce((s, h) => s + h.invested,    0);
  const stInvested = stH.reduce((s, h) => s + h.invested,    0);

  const mfCagr = mfInvested > 0
    ? mfH.reduce((s, h) => s + h.cagr * h.invested, 0) / mfInvested
    : 0;
  const stCagr = stInvested > 0
    ? stH.reduce((s, h) => s + h.cagr * h.invested, 0) / stInvested
    : 0;

  const allYears = totalInvested > 0
    ? active.reduce((s, h) => s + h.years * h.invested, 0) / totalInvested
    : 1;
  const overallCagr = totalInvested > 0 && totalValue > 0
    ? (Math.pow(totalValue / totalInvested, 1 / Math.max(0.1, allYears)) - 1) * 100
    : 0;

  return {
    totalValue, totalInvested, totalGain,
    totalUnrealizedGain, totalRealizedGain, totalReturnPct,
    mfValue, stValue, mfInvested, stInvested,
    mfCagr, stCagr, overallCagr,
    fundCount:  mfH.length,
    stockCount: stH.length,
    mfPct: totalValue > 0 ? (mfValue / totalValue) * 100 : 0,
    stPct: totalValue > 0 ? (stValue / totalValue) * 100 : 0,
  };
}

// ─── Portfolio XIRR ───────────────────────────────────────────────────────────

export function computePortfolioXIRR(trades, currentPrices = {}, precomputedHoldings = null) {
  const holdings = precomputedHoldings ?? computeHoldings(trades, currentPrices);

  const cashflows = trades.map(t => {
    const qty       = parseFloat(t.quantity);
    const price     = parseFloat(t.price);
    const brokerage = t.brokerage ? parseFloat(t.brokerage) : 0;
    const amount    = t.tradeType === 'BUY'
      ? -(qty * price + brokerage)
      :   qty * price - brokerage;
    return { date: (t.tradeDate || '').slice(0, 10), amount };
  });

  const termValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  if (termValue > 0) {
    cashflows.push({ date: new Date().toISOString().slice(0, 10), amount: termValue });
  }

  if (cashflows.length < 2) return null;
  cashflows.sort((a, b) => a.date.localeCompare(b.date));

  return xirr(cashflows);
}

// ─── Realized P&L & Capital Gains Engine ─────────────────────────────────────

export function getFinancialYear(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Unknown';
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1 to 12
  // Indian Financial Year runs from April 1 to March 31
  if (month >= 4) {
    const nextYear = (year + 1).toString().slice(-2);
    return `${year}-${nextYear}`;
  } else {
    const prevYear = year - 1;
    const curYear = year.toString().slice(-2);
    return `${prevYear}-${curYear}`;
  }
}

export function computeCapitalGainsReport(holdings, { fy = '2026-27' } = {}) {
  // 1. Flatten all sell records with symbol, name, exchange, and assetType
  const allSells = [];
  for (const h of holdings) {
    for (const s of (h.sells || [])) {
      const fyOfTrade = getFinancialYear(s.date);
      allSells.push({
        ...s,
        symbol: h.symbol,
        name: h.name || h.symbol,
        assetType: h.assetType,
        exchange: h.exchange,
        fy: fyOfTrade,
      });
    }
  }

  // 2. Extract available Financial Years
  const fySet = new Set(allSells.map(s => s.fy).filter(f => f && f !== 'Unknown'));
  fySet.add('2026-27'); // Always include current FY
  const availableFys = Array.from(fySet).sort().reverse();

  // 3. Filter for requested FY (unless 'ALL')
  const filteredSells = fy === 'ALL'
    ? allSells
    : allSells.filter(s => s.fy === fy);

  // 4. Detailed lot-level breakdown
  let grossLtcg = 0;
  let grossLtcl = 0;
  let grossStcg = 0;
  let grossStcl = 0;

  let stockLtcg = 0, stockLtcl = 0, stockStcg = 0, stockStcl = 0;
  let mfLtcg = 0, mfLtcl = 0, mfStcg = 0, mfStcl = 0;

  const enrichedSells = filteredSells.map(s => {
    let sellLtcg = 0, sellLtcl = 0, sellStcg = 0, sellStcl = 0;
    const isMF = s.assetType === 'MF';

    for (const m of (s.matchedLots || [])) {
      if (m.taxType === 'LTCG') {
        if (m.gain >= 0) {
          sellLtcg += m.gain;
          grossLtcg += m.gain;
          if (isMF) mfLtcg += m.gain; else stockLtcg += m.gain;
        } else {
          sellLtcl += Math.abs(m.gain);
          grossLtcl += Math.abs(m.gain);
          if (isMF) mfLtcl += Math.abs(m.gain); else stockLtcl += Math.abs(m.gain);
        }
      } else {
        if (m.gain >= 0) {
          sellStcg += m.gain;
          grossStcg += m.gain;
          if (isMF) mfStcg += m.gain; else stockStcg += m.gain;
        } else {
          sellStcl += Math.abs(m.gain);
          grossStcl += Math.abs(m.gain);
          if (isMF) mfStcl += Math.abs(m.gain); else stockStcl += Math.abs(m.gain);
        }
      }
    }

    const totalCost = (s.matchedLots || []).reduce((sum, m) => sum + (m.costBasis || 0), 0);
    const totalProceeds = s.qty * s.sellPrice;
    const netGain = totalProceeds - totalCost;

    return {
      ...s,
      totalCost,
      totalProceeds,
      netGain,
      sellLtcg,
      sellLtcl,
      sellStcg,
      sellStcl,
    };
  });

  // 5. Inter-head Loss Set-off Rules (Income Tax Act):
  // Rule 1: LTCL can ONLY be set off against LTCG.
  const ltclUsedAgainstLtcg = Math.min(grossLtcl, grossLtcg);
  const unabsorbedLtcl = grossLtcl - ltclUsedAgainstLtcg;
  let remainingLtcg = grossLtcg - ltclUsedAgainstLtcg;

  // Rule 2: STCL can be set off against STCG first.
  const stclUsedAgainstStcg = Math.min(grossStcl, grossStcg);
  let remainingStcl = grossStcl - stclUsedAgainstStcg;
  const netTaxableStcg = grossStcg - stclUsedAgainstStcg;

  // Rule 3: Any remaining STCL can be set off against remaining LTCG
  const stclUsedAgainstLtcg = Math.min(remainingStcl, remainingLtcg);
  remainingLtcg -= stclUsedAgainstLtcg;
  remainingStcl -= stclUsedAgainstLtcg;
  const unabsorbedStcl = remainingStcl;

  // 6. Section 112A LTCG Exemption (₹1,25,000 post Budget 2024):
  const LTCG_EXEMPTION_LIMIT = 125000;
  const exemptLtcg = Math.min(remainingLtcg, LTCG_EXEMPTION_LIMIT);
  const taxableLtcg = Math.max(0, remainingLtcg - LTCG_EXEMPTION_LIMIT);

  // 7. Tax Liability calculation:
  // LTCG tax @ 12.5% u/s 112A
  const ltcgTax = taxableLtcg * 0.125;

  // STCG tax @ 20% u/s 111A
  const stcgTax = netTaxableStcg * 0.20;

  // 4% Health & Education Cess
  const baseTax = ltcgTax + stcgTax;
  const cess = baseTax * 0.04;
  const totalTax = baseTax + cess;

  const totalRealized = (grossLtcg - grossLtcl) + (grossStcg - grossStcl);

  return {
    fy,
    availableFys,
    totalRealized,
    // LTCG
    grossLtcg,
    grossLtcl,
    netLtcg: grossLtcg - grossLtcl,
    ltclUsedAgainstLtcg,
    unabsorbedLtcl,
    stclUsedAgainstLtcg,
    exemptLtcg,
    taxableLtcg,
    ltcgTax,
    // STCG
    grossStcg,
    grossStcl,
    netStcg: grossStcg - grossStcl,
    stclUsedAgainstStcg,
    unabsorbedStcl,
    netTaxableStcg,
    stcgTax,
    // Tax summary
    baseTax,
    cess,
    totalTax,
    // Category Breakdown
    breakdown: {
      stocks: {
        ltcg: stockLtcg - stockLtcl,
        stcg: stockStcg - stockStcl,
        total: (stockLtcg - stockLtcl) + (stockStcg - stockStcl),
        grossLtcg: stockLtcg,
        grossLtcl: stockLtcl,
        grossStcg: stockStcg,
        grossStcl: stockStcl,
      },
      mf: {
        ltcg: mfLtcg - mfLtcl,
        stcg: mfStcg - mfStcl,
        total: (mfLtcg - mfLtcl) + (mfStcg - mfStcl),
        grossLtcg: mfLtcg,
        grossLtcl: mfLtcl,
        grossStcg: mfStcg,
        grossStcl: mfStcl,
      },
    },
    // Set-off schedule details
    setOffSchedule: [
      {
        description: 'LTCL set-off against LTCG',
        amount: ltclUsedAgainstLtcg,
        remainingLtcl: unabsorbedLtcl,
      },
      {
        description: 'STCL set-off against STCG',
        amount: stclUsedAgainstStcg,
        remainingStcl: grossStcl - stclUsedAgainstStcg,
      },
      ...(stclUsedAgainstLtcg > 0 ? [{
        description: 'Remaining STCL set-off against LTCG',
        amount: stclUsedAgainstLtcg,
        remainingStcl: unabsorbedStcl,
      }] : []),
    ],
    sells: enrichedSells,
  };
}

export function computeRealizedSummary(holdings) {
  const report = computeCapitalGainsReport(holdings, { fy: 'ALL' });
  const sellsBySymbol = {};
  for (const s of report.sells) {
    if (!sellsBySymbol[s.symbol]) sellsBySymbol[s.symbol] = { realized: 0, sells: [] };
    sellsBySymbol[s.symbol].realized += (s.realized ?? s.netGain);
    sellsBySymbol[s.symbol].sells.push(s);
  }

  return {
    totalRealized: report.totalRealized,
    ltcgGain: report.netLtcg,
    stcgGain: report.netStcg,
    ltcgTax: report.ltcgTax,
    stcgTax: report.stcgTax,
    totalTax: report.totalTax,
    sells: report.sells,
    sellsBySymbol,
  };
}

// ─── Monthly flow ─────────────────────────────────────────────────────────────
// FIX (Bug 17): buildMonthlyFlow previously only included BUY trades, which
// was correct for the "Cumulative Invested" chart but misleading for the
// heatmap which is labelled "Monthly Investment Activity".  Now we return both
// BUY amount and a total activity amount (BUY + SELL proceeds) so callers can
// pick the right metric.  The cumulative chart continues to use `amount` (BUY
// only); the heatmap now uses `activity` so redemption-heavy months appear
// appropriately intense.

export function buildMonthlyFlow(trades) {
  const map = {};
  for (const t of trades) {
    const key = (t.tradeDate || '').slice(0, 7);
    if (!key) continue;
    if (!map[key]) map[key] = { month: key, amount: 0, activity: 0 };
    const value = parseFloat(t.quantity) * parseFloat(t.price);
    if (t.tradeType === 'BUY') {
      map[key].amount   += value;   // invested capital (buy only)
      map[key].activity += value;
    } else {
      // SELL counts as activity (non-negative) but not as invested capital
      map[key].activity += value;
    }
  }
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Tax computation ──────────────────────────────────────────────────────────

export function computeTax(holdings) {
  return holdings.map(h => {
    const isLTCG      = h.years >= 1;
    const taxRate     = isLTCG ? 0.125 : 0.20;
    const taxableGain = Math.max(0, h.unrealizedGain ?? h.gain ?? 0);
    const tax = taxableGain * taxRate;
    return { ...h, isLTCG, taxRate, taxableGain, tax };
  });
}

// ─── Tax-Loss Harvesting ───────────────────────────────────────────────────────

export function computeTaxHarvesting(holdings, realizedSummary = {}) {
  const candidateLots = [];
  const today = new Date();

  for (const h of holdings) {
    if (!h.qty || h.qty <= EPSILON || !h.lots || !h.lots.length) continue;
    const cmp = h.cmp || h.avgBuy;

    for (const lot of h.lots) {
      if (lot.qty <= EPSILON) continue;
      const costBasis = lot.qty * lot.price;
      const currentValue = lot.qty * cmp;
      const unrealizedGain = currentValue - costBasis;

      // Only candidate if there is an unrealized loss
      if (unrealizedGain < -EPSILON) {
        const unrealizedLoss = Math.abs(unrealizedGain);
        const lotDate = lot.date ? new Date(lot.date) : today;
        const holdDays = Math.max(0, Math.round((today - lotDate) / (24 * 3600 * 1000)));
        const isLTCG = holdDays >= 365;
        const taxType = isLTCG ? 'LTCL' : 'STCL';

        candidateLots.push({
          symbol: h.symbol,
          name: h.name || h.symbol,
          assetType: h.assetType,
          buyDate: lot.date,
          qty: lot.qty,
          buyPrice: lot.price,
          cmp,
          costBasis,
          currentValue,
          unrealizedLoss,
          holdDays,
          taxType,
          isLTCG,
          lossPct: costBasis > 0 ? (unrealizedLoss / costBasis) * 100 : 0,
        });
      }
    }
  }

  // Aggregate STCL & LTCL candidates
  const stclCandidateLoss = candidateLots.filter(l => l.taxType === 'STCL').reduce((s, l) => s + l.unrealizedLoss, 0);
  const ltclCandidateLoss = candidateLots.filter(l => l.taxType === 'LTCL').reduce((s, l) => s + l.unrealizedLoss, 0);
  const totalHarvestableLoss = stclCandidateLoss + ltclCandidateLoss;

  // Realized gains in current FY
  const realizedSTCG = Math.max(0, realizedSummary?.stcgGain || 0);
  const realizedLTCG = Math.max(0, realizedSummary?.ltcgGain || 0);
  const taxableLTCG  = Math.max(0, realizedLTCG - 125000); // Exemption threshold ₹1.25L

  // Tax savings computation:
  // STCL offsets STCG (saved 20%) and then taxable LTCG (saved 12.5%)
  let stclRemaining = stclCandidateLoss;
  const stclStcgOffset = Math.min(stclRemaining, realizedSTCG);
  stclRemaining -= stclStcgOffset;

  const stclLtcgOffset = Math.min(stclRemaining, taxableLTCG);

  // LTCL can ONLY offset taxable LTCG (saved 12.5%)
  const ltcgTaxableRemaining = Math.max(0, taxableLTCG - stclLtcgOffset);
  const ltclLtcgOffset = Math.min(ltclCandidateLoss, ltcgTaxableRemaining);

  const stcgTaxSaved = stclStcgOffset * 0.20;
  const ltcgTaxSaved = (stclLtcgOffset + ltclLtcgOffset) * 0.125;
  const potentialTaxSavings = stcgTaxSaved + ltcgTaxSaved;

  // Assign estimated savings to individual candidate lots
  for (const lot of candidateLots) {
    if (lot.taxType === 'STCL') {
      const estRate = (realizedSTCG > 0) ? 0.20 : (taxableLTCG > 0) ? 0.125 : 0.20;
      lot.estimatedSavings = lot.unrealizedLoss * estRate;
    } else {
      lot.estimatedSavings = lot.unrealizedLoss * 0.125;
    }
  }

  candidateLots.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss);

  return {
    totalHarvestableLoss,
    stclCandidateLoss,
    ltclCandidateLoss,
    potentialTaxSavings,
    realizedSTCG,
    realizedLTCG,
    taxableLTCG,
    stcgTaxSaved,
    ltcgTaxSaved,
    candidateLots,
  };
}

// ─── Wealth projection ────────────────────────────────────────────────────────

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
    data.push({ year: y, corpus: Math.round(corpus), invested: Math.round(totalInvested), gain: Math.round(corpus - totalInvested) });
  }
  return data;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function daysBetween(dateStrA, dateStrB) {
  return Math.round((new Date(dateStrB) - new Date(dateStrA)) / (24 * 3600 * 1000));
}

function dominantTaxType(matchedLots) {
  if (!matchedLots.length) return 'STCG';
  const ltcgGain = matchedLots
    .filter(m => m.taxType === 'LTCG')
    .reduce((s, m) => s + Math.abs(m.gain || m.costBasis), 0);
  const stcgGain = matchedLots
    .filter(m => m.taxType === 'STCG')
    .reduce((s, m) => s + Math.abs(m.gain || m.costBasis), 0);
  return ltcgGain >= stcgGain ? 'LTCG' : 'STCG';
}

// ─── Formatters ───────────────────────────────────────────────────────────────

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

export function sectorColor(s) {
  return SECTOR_COLORS[s] || SECTOR_COLORS.Other;
}
