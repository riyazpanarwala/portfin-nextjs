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
          isin:        meta.isin || null,
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
      isin:      meta.isin     || null,
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
        isin: s.isin || h.isin || null,
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
    schedule112A: (() => {
      const rows = [];
      let srNo = 1;
      for (const s of enrichedSells) {
        const ltcgMatched = (s.matchedLots || []).filter(m => m.taxType === 'LTCG');
        if (ltcgMatched.length > 0) {
          for (const m of ltcgMatched) {
            const fullValueConsideration = m.qty * s.sellPrice;
            const costOfAcquisition = m.costBasis;
            const gain = fullValueConsideration - costOfAcquisition;
            rows.push({
              srNo: srNo++,
              sellDate: s.date,
              isin: s.isin || s.symbol,
              symbol: s.symbol,
              name: s.name || s.symbol,
              assetType: s.assetType,
              quantity: m.qty,
              salePrice: s.sellPrice,
              fullValueConsideration,
              costOfAcquisition,
              expenditure: 0,
              totalDeductions: costOfAcquisition,
              balance: gain,
              deduction54F: 0,
              netLtcg: gain,
              buyDate: m.buyDate,
              buyPrice: m.buyPrice,
              holdDays: m.holdDays,
            });
          }
        } else if (s.taxType === 'LTCG') {
          const fullValueConsideration = s.totalProceeds;
          const costOfAcquisition = s.totalCost;
          const gain = s.netGain;
          rows.push({
            srNo: srNo++,
            sellDate: s.date,
            isin: s.isin || s.symbol,
            symbol: s.symbol,
            name: s.name || s.symbol,
            assetType: s.assetType,
            quantity: s.qty,
            salePrice: s.sellPrice,
            fullValueConsideration,
            costOfAcquisition,
            expenditure: 0,
            totalDeductions: costOfAcquisition,
            balance: gain,
            deduction54F: 0,
            netLtcg: gain,
            buyDate: '',
            buyPrice: 0,
            holdDays: 0,
          });
        }
      }
      return rows;
    })(),
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

// ─── Interactive Smart Tax-Harvesting Simulator Engine ─────────────────────────

export function simulateTaxHarvesting(
  holdings = [],
  realizedReport = {},
  lotOverrides = {},
  strategy = 'OPTIMAL'
) {
  const today = new Date();

  // Baseline figures from current FY realized report
  const baseGrossStcg = realizedReport.grossStcg || 0;
  const baseGrossStcl = realizedReport.grossStcl || 0;
  const baseGrossLtcg = realizedReport.grossLtcg || 0;
  const baseGrossLtcl = realizedReport.grossLtcl || 0;
  const baseTotalTax  = realizedReport.totalTax || 0;
  const baseExemptLtcg = realizedReport.exemptLtcg || 0;
  const baseTaxableLtcg = realizedReport.taxableLtcg || 0;
  const baseTaxableStcg = realizedReport.netTaxableStcg || 0;

  const LTCG_LIMIT = 125000;
  const remainingLtcgExemption = Math.max(0, LTCG_LIMIT - baseExemptLtcg);

  // 1. Gather all candidate lots across active holdings
  const allCandidateLots = [];

  for (const h of holdings) {
    if (!h.qty || h.qty <= EPSILON || !h.lots || !h.lots.length) continue;
    const cmp = h.cmp || h.avgBuy;

    for (let idx = 0; idx < h.lots.length; idx++) {
      const lot = h.lots[idx];
      if (lot.qty <= EPSILON) continue;
      const lotKey = `${h.symbol}_${lot.date || 'unknown'}_${idx}`;
      const lotDate = lot.date ? new Date(lot.date) : today;
      const holdDays = Math.max(0, Math.round((today - lotDate) / (24 * 3600 * 1000)));
      const isLTCG = holdDays >= 365;
      const taxType = isLTCG ? 'LTCG' : 'STCG';

      const costBasis = lot.qty * lot.price;
      const currentValue = lot.qty * cmp;
      const unrealizedGain = currentValue - costBasis;
      const isGain = unrealizedGain > EPSILON;
      const isLoss = unrealizedGain < -EPSILON;

      if (!isGain && !isLoss) continue;

      const gainLossPct = costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0;

      allCandidateLots.push({
        lotKey,
        symbol: h.symbol,
        isin: h.isin || null,
        name: h.name || h.symbol,
        assetType: h.assetType,
        buyDate: lot.date,
        buyPrice: lot.price,
        qty: lot.qty,
        cmp,
        costBasis,
        currentValue,
        unrealizedGain,
        isGain,
        isLoss,
        isLTCG,
        taxType,
        holdDays,
        gainLossPct,
      });
    }
  }

  // Separate into Gain Candidates (LTCG only for 0% tax) and Loss Candidates (STCL & LTCL)
  const ltcgGainCandidates = allCandidateLots
    .filter(l => l.isGain && l.isLTCG)
    .sort((a, b) => b.unrealizedGain - a.unrealizedGain);

  const lossCandidates = allCandidateLots
    .filter(l => l.isLoss)
    .sort((a, b) => {
      // Prioritize STCL (offsets 20% STCG) over LTCL (offsets 12.5% LTCG)
      if (a.taxType !== b.taxType) {
        return a.taxType === 'STCG' ? -1 : 1;
      }
      return a.unrealizedGain - b.unrealizedGain;
    });

  // Calculate default auto-selections if no user override provided
  const hasUserOverrides = Object.keys(lotOverrides).length > 0;
  const effectiveSelections = {};

  if (hasUserOverrides) {
    for (const lot of allCandidateLots) {
      if (lotOverrides[lot.lotKey]) {
        effectiveSelections[lot.lotKey] = {
          selected: !!lotOverrides[lot.lotKey].selected,
          harvestRatio: Math.max(0, Math.min(1, lotOverrides[lot.lotKey].harvestRatio ?? 1)),
        };
      } else {
        effectiveSelections[lot.lotKey] = { selected: false, harvestRatio: 1 };
      }
    }
  } else {
    // Strategy A / OPTIMAL: Select loss lots to wipe out taxable gains
    if (strategy === 'LOSS' || strategy === 'OPTIMAL' || strategy === 'ALL') {
      let neededStclOffset = baseTaxableStcg;
      let neededLtcgOffset = baseTaxableLtcg;

      for (const lot of lossCandidates) {
        const lossAbs = Math.abs(lot.unrealizedGain);
        if (lot.taxType === 'STCG') {
          if (neededStclOffset > 0 || neededLtcgOffset > 0) {
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: 1 };
            if (neededStclOffset > 0) {
              neededStclOffset = Math.max(0, neededStclOffset - lossAbs);
            } else {
              neededLtcgOffset = Math.max(0, neededLtcgOffset - lossAbs);
            }
          }
        } else {
          if (neededLtcgOffset > 0) {
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: 1 };
            neededLtcgOffset = Math.max(0, neededLtcgOffset - lossAbs);
          }
        }
      }
    }

    // Strategy B / OPTIMAL: Select LTCG winners up to remaining ₹1.25L exemption
    if (strategy === 'GAIN' || strategy === 'OPTIMAL' || strategy === 'ALL') {
      let capRemaining = remainingLtcgExemption;
      for (const lot of ltcgGainCandidates) {
        if (capRemaining > 500) {
          if (lot.unrealizedGain <= capRemaining) {
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: 1 };
            capRemaining -= lot.unrealizedGain;
          } else {
            const partialRatio = Math.max(0.05, capRemaining / lot.unrealizedGain);
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: Math.min(1, partialRatio) };
            capRemaining = 0;
          }
        }
      }
    }
  }

  // 2. Compute simulated execution impact
  let addHarvestStcg = 0;
  let addHarvestStcl = 0;
  let addHarvestLtcg = 0;
  let addHarvestLtcl = 0;
  let totalProceeds = 0;

  const orders = [];

  for (const lot of allCandidateLots) {
    const sel = effectiveSelections[lot.lotKey] || { selected: false, harvestRatio: 1 };
    lot.isSelected = sel.selected;
    lot.harvestRatio = sel.harvestRatio;
    lot.qtyToSell = sel.selected ? lot.qty * sel.harvestRatio : 0;
    lot.simulatedProceeds = lot.qtyToSell * lot.cmp;
    lot.simulatedCost = lot.qtyToSell * lot.buyPrice;
    lot.simulatedGain = lot.simulatedProceeds - lot.simulatedCost;

    if (sel.selected && lot.qtyToSell > EPSILON) {
      totalProceeds += lot.simulatedProceeds;

      if (lot.isLTCG) {
        if (lot.simulatedGain >= 0) addHarvestLtcg += lot.simulatedGain;
        else                        addHarvestLtcl += Math.abs(lot.simulatedGain);
      } else {
        if (lot.simulatedGain >= 0) addHarvestStcg += lot.simulatedGain;
        else                        addHarvestStcl += Math.abs(lot.simulatedGain);
      }

      orders.push({
        lotKey: lot.lotKey,
        symbol: lot.symbol,
        isin: lot.isin,
        name: lot.name,
        assetType: lot.assetType,
        buyDate: lot.buyDate,
        taxType: lot.isLTCG ? 'LTCG' : 'STCG',
        holdDays: lot.holdDays,
        unitsToSell: lot.qtyToSell,
        totalUnits: lot.qty,
        cmp: lot.cmp,
        costBasis: lot.simulatedCost,
        estimatedProceeds: lot.simulatedProceeds,
        gainOrLoss: lot.simulatedGain,
        isGain: lot.simulatedGain >= 0,
        strategyAction: lot.simulatedGain >= 0
          ? '0% Tax Gain Step-Up (Sell & Re-enter)'
          : lot.isLTCG
            ? 'LTCL Loss Offset (@ 12.5% Tax Saved)'
            : 'STCL Loss Offset (@ 20% Tax Saved)',
      });
    }
  }

  // 3. Rerun tax set-off on combined (realized + simulated) gains
  const combGrossStcg = baseGrossStcg + addHarvestStcg;
  const combGrossStcl = baseGrossStcl + addHarvestStcl;
  const combGrossLtcg = baseGrossLtcg + addHarvestLtcg;
  const combGrossLtcl = baseGrossLtcl + addHarvestLtcl;

  const simLtclUsedAgainstLtcg = Math.min(combGrossLtcl, combGrossLtcg);
  let simRemLtcg = combGrossLtcg - simLtclUsedAgainstLtcg;
  const simUnabsorbedLtcl = combGrossLtcl - simLtclUsedAgainstLtcg;

  const simStclUsedAgainstStcg = Math.min(combGrossStcl, combGrossStcg);
  let simRemStcl = combGrossStcl - simStclUsedAgainstStcg;
  const simNetTaxableStcg = combGrossStcg - simStclUsedAgainstStcg;

  const simStclUsedAgainstLtcg = Math.min(simRemStcl, simRemLtcg);
  simRemLtcg -= simStclUsedAgainstLtcg;
  simRemStcl -= simStclUsedAgainstLtcg;
  const simUnabsorbedStcl = simRemStcl;

  const simExemptLtcg = Math.min(simRemLtcg, LTCG_LIMIT);
  const simTaxableLtcg = Math.max(0, simRemLtcg - LTCG_LIMIT);

  const simLtcgTax = simTaxableLtcg * 0.125;
  const simStcgTax = simNetTaxableStcg * 0.20;
  const simBaseTax = simLtcgTax + simStcgTax;
  const simCess = simBaseTax * 0.04;
  const simTotalTax = simBaseTax + simCess;

  const immediateTaxSaved = Math.max(0, baseTotalTax - simTotalTax);
  const harvestedTaxFreeGains = Math.max(0, simExemptLtcg - baseExemptLtcg);
  const futureLtcgTaxShielded = harvestedTaxFreeGains * 0.125;
  const totalFinancialBenefit = immediateTaxSaved + futureLtcgTaxShielded;

  return {
    strategy,
    baseline: {
      grossStcg: baseGrossStcg,
      grossStcl: baseGrossStcl,
      grossLtcg: baseGrossLtcg,
      grossLtcl: baseGrossLtcl,
      taxableStcg: baseTaxableStcg,
      taxableLtcg: baseTaxableLtcg,
      exemptLtcg: baseExemptLtcg,
      remainingLtcgExemption,
      totalTax: baseTotalTax,
    },
    simulated: {
      harvestedStcg: addHarvestStcg,
      harvestedStcl: addHarvestStcl,
      harvestedLtcg: addHarvestLtcg,
      harvestedLtcl: addHarvestLtcl,
      grossStcg: combGrossStcg,
      grossStcl: combGrossStcl,
      grossLtcg: combGrossLtcg,
      grossLtcl: combGrossLtcl,
      taxableStcg: simNetTaxableStcg,
      taxableLtcg: simTaxableLtcg,
      exemptLtcg: simExemptLtcg,
      totalTax: simTotalTax,
      ltcgTax: simLtcgTax,
      stcgTax: simStcgTax,
      cess: simCess,
      unabsorbedStcl: simUnabsorbedStcl,
      unabsorbedLtcl: simUnabsorbedLtcl,
    },
    impact: {
      immediateTaxSaved,
      harvestedTaxFreeGains,
      futureLtcgTaxShielded,
      totalFinancialBenefit,
      totalProceeds,
      selectedLotsCount: orders.length,
    },
    candidateLots: allCandidateLots,
    gainCandidates: ltcgGainCandidates,
    lossCandidates,
    orders,
    effectiveSelections,
  };
}

// ─── Schedule 112A & Tax Export Generators ────────────────────────────────────

export function generateSchedule112ACsv(report) {
  const headers = [
    'Sr. No.',
    'Whether shares/units acquired on or before 31st January 2018?',
    'ISIN Code',
    'Name of the Share/Unit',
    'No. of Shares/Units',
    'Sale-price per share/unit',
    'Full Value of Consideration',
    'Cost of acquisition without indexation',
    'Cost of acquisition',
    'Fair Market Value per share/unit as on 31st January 2018',
    'Total Fair Market Value as on 31st January 2018',
    'Lower of Consideration and Total Fair Market Value',
    'Cost of acquisition (Higher of actual cost and lower of consideration/FMV)',
    'Expenditure wholly and exclusively in connection with transfer',
    'Total Deductions',
    'Balance (Full Value of Consideration - Total Deductions)',
    'Deductions under section 54F',
    'Net Long Term Capital Gain',
  ];

  const rows = (report.schedule112A || []).map((row, idx) => [
    idx + 1,
    'No',
    row.isin || row.symbol,
    `"${(row.name || row.symbol).replace(/"/g, '""')}"`,
    typeof row.quantity === 'number' ? row.quantity.toFixed(row.assetType === 'MF' ? 3 : 0) : row.quantity,
    Number(row.salePrice || 0).toFixed(2),
    Number(row.fullValueConsideration || 0).toFixed(2),
    Number(row.costOfAcquisition || 0).toFixed(2),
    Number(row.costOfAcquisition || 0).toFixed(2),
    '0.00',
    '0.00',
    '0.00',
    Number(row.costOfAcquisition || 0).toFixed(2),
    '0.00',
    Number(row.costOfAcquisition || 0).toFixed(2),
    Number(row.netLtcg || 0).toFixed(2),
    '0.00',
    Number(row.netLtcg || 0).toFixed(2),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function generateSchedule112AJson(report) {
  const ay = report.fy && report.fy !== 'ALL'
    ? `${parseInt(report.fy.slice(0, 4), 10) + 1}-${String(parseInt(report.fy.slice(5, 7), 10) + 1).padStart(2, '0')}`
    : '2027-28';

  return JSON.stringify({
    schemaVersion: 'ITR-2/112A/2024-25',
    financialYear: report.fy || '2026-27',
    assessmentYear: ay,
    generatedAt: new Date().toISOString(),
    summary: {
      totalTransactions: report.schedule112A?.length || 0,
      grossLtcg: report.grossLtcg || 0,
      exemptLtcgSec112A: report.exemptLtcg || 0,
      taxableLtcg: report.taxableLtcg || 0,
      ltcgTaxPayable: report.ltcgTax || 0,
      stcgTaxPayable: report.stcgTax || 0,
      totalTaxPayable: report.totalTax || 0,
    },
    schedule112A: (report.schedule112A || []).map((row, idx) => ({
      srNo: idx + 1,
      isin: row.isin || row.symbol,
      shareName: row.name,
      assetType: row.assetType,
      sharesAcquiredPrior2018: false,
      quantity: row.quantity,
      salePricePerUnit: row.salePrice,
      fullValueOfConsideration: row.fullValueConsideration,
      costOfAcquisitionWithoutIndexation: row.costOfAcquisition,
      transferExpenditure: 0,
      totalDeductions: row.costOfAcquisition,
      balance: row.netLtcg,
      deduction54F: 0,
      netLtcg: row.netLtcg,
      saleDate: row.sellDate,
      matchedBuyDate: row.buyDate,
      holdingPeriodDays: row.holdDays,
    })),
  }, null, 2);
}

export function generateSchedule111ACsv(report) {
  const ay = report.fy && report.fy !== 'ALL'
    ? `${parseInt(report.fy.slice(0, 4), 10) + 1}-${String(parseInt(report.fy.slice(5, 7), 10) + 1).padStart(2, '0')}`
    : '2027-28';

  const stcgRows = [];
  let srNo = 1;
  let totalProceeds = 0;
  let totalCost = 0;

  for (const s of (report.sells || [])) {
    const stcgLots = (s.matchedLots || []).filter(m => m.taxType === 'STCG');
    if (stcgLots.length > 0) {
      for (const m of stcgLots) {
        const proceeds = m.qty * s.sellPrice;
        const cost = m.costBasis || (m.qty * m.buyPrice);
        const gain = proceeds - cost;
        totalProceeds += proceeds;
        totalCost += cost;

        stcgRows.push([
          srNo++,
          s.date,
          m.buyDate,
          m.holdDays,
          s.isin || s.symbol,
          `"${(s.name || s.symbol).replace(/"/g, '""')}"`,
          s.assetType === 'MF' ? 'Mutual Fund' : 'Equity Share',
          typeof m.qty === 'number' ? m.qty.toFixed(s.assetType === 'MF' ? 3 : 0) : m.qty,
          Number(s.sellPrice || 0).toFixed(2),
          Number(proceeds).toFixed(2),
          Number(m.buyPrice || 0).toFixed(2),
          Number(cost).toFixed(2),
          '0.00',
          Number(gain).toFixed(2),
        ]);
      }
    } else if (s.taxType === 'STCG') {
      const proceeds = s.totalProceeds || (s.qty * s.sellPrice);
      const cost = s.totalCost || 0;
      const gain = s.netGain || (proceeds - cost);
      totalProceeds += proceeds;
      totalCost += cost;

      stcgRows.push([
        srNo++,
        s.date,
        '',
        '',
        s.isin || s.symbol,
        `"${(s.name || s.symbol).replace(/"/g, '""')}"`,
        s.assetType === 'MF' ? 'Mutual Fund' : 'Equity Share',
        typeof s.qty === 'number' ? s.qty.toFixed(s.assetType === 'MF' ? 3 : 0) : s.qty,
        Number(s.sellPrice || 0).toFixed(2),
        Number(proceeds).toFixed(2),
        '',
        Number(cost).toFixed(2),
        '0.00',
        Number(gain).toFixed(2),
      ]);
    }
  }

  const netStcg = totalProceeds - totalCost;

  const summaryLines = [
    '# ITR-2 SCHEDULE CG — SECTION 111A (SHORT-TERM CAPITAL GAINS TAXABLE @ 20%)',
    `# Financial Year: ${report.fy || '2026-27'},Assessment Year: ${ay}`,
    '# ---------------------------------------------------------------------------------',
    '# CONSOLIDATED SECTION 111A SUMMARY (PUNCH DIRECTLY INTO ITR-2 / TAX SOFTWARE):',
    `# 1. Full Value of Consideration (Gross Short-Term Sale Proceeds):,${totalProceeds.toFixed(2)}`,
    `# 2. Cost of Acquisition without indexation (FIFO Basis):,${totalCost.toFixed(2)}`,
    '# 3. Expenditure incurred wholly and exclusively in connection with transfer:,0.00',
    `# 4. Total Deductions (Cost + Expenditure):,${totalCost.toFixed(2)}`,
    `# 5. Net Short-Term Capital Gain u/s 111A:,${netStcg.toFixed(2)}`,
    `# 6. STCL Set-off against STCG:,${(report.stclUsedAgainstStcg || 0).toFixed(2)}`,
    `# 7. Net Taxable STCG (Taxable @ 20%):,${(report.netTaxableStcg || 0).toFixed(2)}`,
    `# 8. Estimated STCG Tax @ 20% + 4% Cess:,${(report.stcgTax ? report.stcgTax * 1.04 : 0).toFixed(2)}`,
    '# ---------------------------------------------------------------------------------',
    '',
  ];

  const tableHeaders = [
    'Sr. No.',
    'Sell Date',
    'Buy Date',
    'Holding Days',
    'ISIN Code',
    'Name of the Share/Unit',
    'Asset Type',
    'No. of Shares/Units',
    'Sale Price per Unit',
    'Full Value of Consideration',
    'Purchase Price per Unit',
    'Cost of Acquisition',
    'Transfer Expenditure',
    'Net Short Term Capital Gain/Loss',
  ];

  return [
    ...summaryLines,
    tableHeaders.join(','),
    ...stcgRows.map(r => r.join(',')),
  ].join('\n');
}

export function generateHarvestingExecutionCsv(orders = []) {
  const headers = [
    'Action',
    'Symbol',
    'ISIN',
    'Security Name',
    'Asset Type',
    'Units to Sell',
    'Current Market Price (CMP)',
    'Estimated Sale Proceeds',
    'FIFO Cost Basis',
    'Capital Gain / Loss Triggered',
    'Tax Term',
    'Execution Strategy / Recommendation',
  ];

  const rows = orders.map(o => [
    'SELL',
    o.symbol,
    o.isin || '',
    `"${(o.name || o.symbol).replace(/"/g, '""')}"`,
    o.assetType,
    typeof o.unitsToSell === 'number' ? o.unitsToSell.toFixed(o.assetType === 'MF' ? 3 : 0) : o.unitsToSell,
    Number(o.cmp || 0).toFixed(2),
    Number(o.estimatedProceeds || 0).toFixed(2),
    Number(o.costBasis || 0).toFixed(2),
    Number(o.gainOrLoss || 0).toFixed(2),
    o.taxType,
    `"${(o.strategyAction || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
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
