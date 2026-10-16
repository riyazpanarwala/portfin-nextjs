// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION PORTFOLIO ENGINE
// ─────────────────────────────────────────────────────────────────────────────

import { xirr } from './xirr.js';
import { applyCorporateActions } from './corporateActions.js';
import { dayKey, currentFinancialYear, isLongTermEquity, equityTaxReview, usesEquityTaxRules } from './financialRules.js';
import { FinancialDecimal as D, decimal, decimalField, sumDecimal, financialResult, lotCost } from './financialDecimal.js';

const EPSILON = 1e-9;

// ─── FIFO Engine ─────────────────────────────────────────────────────────────

export function computeHoldings(trades, currentPrices = {}, { asOf = dayKey(new Date()), corporateActions = [] } = {}) {
  trades = applyCorporateActions(trades, corporateActions, asOf);
  const bySymbol = Object.create(null);

  for (const t of trades) {
    const key = t.instrumentId || `${t.symbol}:${t.exchange || ''}`;
    if (!bySymbol[key]) bySymbol[key] = { meta: t, buys: [], sells: [] };
    const normDate = (t.tradeDate || '').slice(0, 10);
    const normTrade = { ...t, tradeDate: normDate };
    if (t.tradeType === 'BUY') bySymbol[key].buys.push(normTrade);
    else                       bySymbol[key].sells.push(normTrade);
  }

  const holdings = [];

  for (const { meta, buys, sells } of Object.values(bySymbol)) {
    const symbol = meta.symbol;
    const lotQueue = buys
      .slice()
      .sort(compareTrades)
      .filter(t => decimal(t.quantity).gt(0))
      .map(t => {
        const qty = decimal(t.quantity), rawPrice = decimal(t.price);
        const grossCost = decimal(t.grossAmount ?? qty.times(rawPrice));
        const cost = grossCost.plus(t.brokerage || 0), taxCost = grossCost.plus(t.taxBrokerage || 0);
        return {
          date: t.tradeDate, qty,
          price: cost.div(qty), rawPrice,
          taxPrice: taxCost.div(qty), cost, taxCost,
          feesNeedReview: decimal(t.brokerage || 0).gt(0) && t.taxBrokerage == null,
          id: t.id, source: t,
          remaining: qty, remainingCost: cost, remainingTaxCost: taxCost,
        };
      });

    const earliestBuyDate = lotQueue.length > 0 ? lotQueue[0].date : null;
    const totalEverInvested = sumDecimal(lotQueue, l => l.cost);

    const sellRecords = [];
    let realizedGain = decimal(0);
    let unmatchedSellQty = decimal(0);

    const sortedSells = sells
      .slice()
      .sort(compareTrades);

    for (const sellTrade of sortedSells) {
      const sellQty = decimal(sellTrade.quantity);
      if (sellQty.isZero()) continue;
      let sellQtyLeft = sellQty;
      const sellPrice = decimal(sellTrade.price);
      const sellGross = decimal(sellTrade.grossAmount ?? sellQty.times(sellPrice));
      let remainingGross = sellGross;
      let remainingFee = decimal(sellTrade.brokerage || 0), remainingTaxFee = decimal(sellTrade.taxBrokerage || 0);
      const sellDate    = sellTrade.tradeDate;
      const matchedLots = [];

      for (const lot of lotQueue) {
        if (sellQtyLeft.lte(EPSILON)) break;
        if (lot.remaining.lte(EPSILON)) continue;
        if (lot.date > sellDate) continue;
        if (lot.date === sellDate && compareTrades(lot.source, sellTrade) > 0) continue;

        const consumed = D.min(lot.remaining, sellQtyLeft);
        // Use the residual on the final allocation so even recurring divisions conserve cost/fees.
        const costBasis = consumed.eq(lot.remaining) ? lot.remainingCost : lot.cost.times(consumed).div(lot.qty);
        const taxCostBasis = consumed.eq(lot.remaining) ? lot.remainingTaxCost : lot.taxCost.times(consumed).div(lot.qty);
        const sellFee = consumed.eq(sellQtyLeft) ? remainingFee : decimal(sellTrade.brokerage || 0).times(consumed).div(sellQty);
        const taxSellFee = consumed.eq(sellQtyLeft) ? remainingTaxFee : decimal(sellTrade.taxBrokerage || 0).times(consumed).div(sellQty);
        const grossProceeds = consumed.eq(sellQtyLeft) ? remainingGross : sellGross.times(consumed).div(sellQty);
        const proceeds = grossProceeds.minus(sellFee);
        const lotGain = proceeds.minus(costBasis);
        const holdDays  = daysBetween(lot.date, sellDate);
        const taxType   = isLongTermEquity(lot.date, sellDate) ? 'LTCG' : 'STCG';

        matchedLots.push({
          buyDate: lot.date, qty: consumed, buyPrice: lot.price,
          holdDays, taxType, costBasis, gain: lotGain,
          grossProceeds, sellFee, taxCostBasis, expenditure: taxSellFee,
          taxGain: grossProceeds.minus(taxSellFee).minus(taxCostBasis),
          feesNeedReview: lot.feesNeedReview || (decimal(sellTrade.brokerage || 0).gt(0) && sellTrade.taxBrokerage == null),
        });
        lot.remaining = lot.remaining.minus(consumed);
        lot.remainingCost = lot.remainingCost.minus(costBasis);
        lot.remainingTaxCost = lot.remainingTaxCost.minus(taxCostBasis);
        sellQtyLeft = sellQtyLeft.minus(consumed);
        remainingFee = remainingFee.minus(sellFee);
        remainingTaxFee = remainingTaxFee.minus(taxSellFee);
        remainingGross = remainingGross.minus(grossProceeds);
        realizedGain = realizedGain.plus(lotGain);
      }

      if (sellQtyLeft.gt(EPSILON)) {
        unmatchedSellQty = unmatchedSellQty.plus(sellQtyLeft);
        console.warn(
          `[portfin] FIFO mismatch for ${symbol}: ${sellQtyLeft.toFixed(4)} units sold ` +
          `on ${sellDate} have no matching buy lots. Realized gain is understated.`
        );
      }

      const actualQtySold = sellQty.minus(D.max(0, sellQtyLeft));
      if (actualQtySold.gt(EPSILON) || sellQtyLeft.gt(EPSILON)) {
        sellRecords.push({
          date:        sellDate,
          id: sellTrade.id,
          taxCategory: meta.taxCategory || 'UNKNOWN',
          unmatchedQty: D.max(0, sellQtyLeft),
          isin:        meta.isin || null,
          qty:         actualQtySold,
          sellPrice,
          grossProceeds: sumDecimal(matchedLots, m => m.grossProceeds),
          realized: sumDecimal(matchedLots, m => m.gain),
          matchedLots,
          taxType: dominantTaxType(matchedLots),
        });
      }
    }

    const remainingLots = lotQueue
      .filter(l => l.remaining.gt(EPSILON))
      .map(l => ({ id: l.id, date: l.date, qty: l.remaining, price: l.price, taxPrice: l.taxPrice, rawPrice: l.rawPrice, costBasis: l.remainingCost, taxCostBasis: l.remainingTaxCost, feesNeedReview: l.feesNeedReview }));

    const qty = sumDecimal(remainingLots, l => l.qty);
    const invested = sumDecimal(remainingLots, l => l.costBasis);

    if (qty.lte(EPSILON) && realizedGain.isZero() && sellRecords.length === 0 && unmatchedSellQty.lte(EPSILON)) continue;

    const avgBuy = qty.gt(EPSILON) ? invested.div(qty) : decimal(0);
    const suppliedPrice = meta.instrumentId ? currentPrices[meta.instrumentId] : currentPrices[symbol];
    const priceAvailable = suppliedPrice != null && Number.isFinite(Number(suppliedPrice)) && Number(suppliedPrice) > 0;
    const cmp = priceAvailable ? decimal(suppliedPrice) : avgBuy;
    const marketValue = priceAvailable ? qty.times(cmp) : invested;
    const unrealizedGain = marketValue.minus(invested);
    const totalGain = unrealizedGain.plus(realizedGain);

    const returnPct = totalEverInvested.gt(EPSILON) ? totalGain.div(totalEverInvested).times(100) : decimal(0);
    const unrealizedReturnPct = invested.gt(EPSILON) ? unrealizedGain.div(invested).times(100) : decimal(0);
	
	const firstDate = earliestBuyDate ? new Date(earliestBuyDate) : new Date(asOf);
	const holdingDays = Math.max(0, Math.round((new Date(asOf) - firstDate) / (24 * 3600 * 1000)));
	const years       = Math.max(0.1, holdingDays / 365.25);

	const rawCagr = invested.gt(EPSILON) && marketValue.gt(0)
	  ? (Math.pow(marketValue.div(invested).toNumber(), 1 / years) - 1) * 100
	  : 0;

    // FIX: annualizing returns for very short holding periods (years floored to
	// 0.1, i.e. ~36 days) can blow up to billions of percent for large absolute
	// gains (e.g. a 15x return in 1 month -> 15^10 * 100%). That's mathematically
	// "correct" CAGR but meaningless, breaks the UI layout, and overflows the
	// Decimal(8,2) mfCagr/stCagr snapshot columns when aggregated. Clamp to a
	// display-sane range — CAGR isn't a useful metric beyond this for any holding.
	const CAGR_CAP = 9999.99;
	const cagr = Math.max(-99.99, Math.min(rawCagr, CAGR_CAP));

    const winCount = sellRecords.filter(s => s.realized.gt(0)).length;
    const lossCount = sellRecords.filter(s => s.realized.lt(0)).length;

    holdings.push(financialResult({
      symbol,
      instrumentId: meta.instrumentId || null,
      taxCategory: meta.taxCategory || 'UNKNOWN',
      priceAvailable, valuationAt: asOf,
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
      hasDataError: unmatchedSellQty.gt(EPSILON),
      unmatchedSellQty,
      stats: {
        trades:            buys.length + sells.length,
        buyTrades:         buys.length,
        sellTrades:        sells.length,
        winCount,
        lossCount,
        totalSellProceeds: sumDecimal(sellRecords, sr => sr.grossProceeds),
      },
    }));
  }

  return holdings.filter(h => h.qty > EPSILON || h.realizedGain !== 0 || h.sells.length > 0 || h.hasDataError);
}

function compareTrades(a, b) {
  return a.tradeDate.localeCompare(b.tradeDate) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id || '').localeCompare(String(b.id || ''));
}

// ─── Portfolio-level stats ────────────────────────────────────────────────────

export function computePortfolioStats(holdings) {
  const active = holdings.filter(h => h.qty > EPSILON);

  const totalValue = sumDecimal(active, h => decimalField(h, 'marketValue'));
  const totalInvested = sumDecimal(active, h => decimalField(h, 'invested'));
  const totalUnrealizedGain = sumDecimal(active, h => decimalField(h, 'unrealizedGain'));
  const totalRealizedGain = sumDecimal(holdings, h => decimalField(h, 'realizedGain'));
  const totalGain = totalUnrealizedGain.plus(totalRealizedGain);

  const totalEverInvested = sumDecimal(holdings, h => decimalField(h, h.totalEverInvested == null ? 'invested' : 'totalEverInvested'));
  const totalReturnPct = totalEverInvested.gt(EPSILON) ? totalGain.div(totalEverInvested).times(100) : decimal(0);

  const mfH = active.filter(h => h.assetType === 'MF');
  const stH = active.filter(h => h.assetType === 'STOCK');

  const mfValue = sumDecimal(mfH, h => decimalField(h, 'marketValue'));
  const stValue = sumDecimal(stH, h => decimalField(h, 'marketValue'));
  const mfInvested = sumDecimal(mfH, h => decimalField(h, 'invested'));
  const stInvested = sumDecimal(stH, h => decimalField(h, 'invested'));

  const mfCagr = mfInvested.gt(0) ? sumDecimal(mfH, h => decimalField(h, 'invested').times(h.cagr)).div(mfInvested) : decimal(0);
  const stCagr = computeOpenStockReturn(stH);

  const allYears = totalInvested.gt(0)
    ? sumDecimal(active, h => decimalField(h, 'invested').times(h.years)).div(totalInvested).toNumber()
    : 1;
  const overallCagr = totalInvested.gt(0) && totalValue.gt(0)
    ? (Math.pow(totalValue.div(totalInvested).toNumber(), 1 / Math.max(0.1, allYears)) - 1) * 100
    : 0;

  return financialResult({
    totalValue, totalInvested, totalGain,
    totalUnrealizedGain, totalRealizedGain, totalReturnPct,
    mfValue, stValue, mfInvested, stInvested,
    mfCagr, stCagr, overallCagr,
    fundCount:  mfH.length,
    stockCount: stH.length,
    mfPct: totalValue.gt(0) ? mfValue.div(totalValue).times(100) : decimal(0),
    stPct: totalValue.gt(0) ? stValue.div(totalValue).times(100) : decimal(0),
  });
}

// One money-weighted annualized return for the open stock position. Averaging
// individual CAGRs can reverse the sign of an overall loss. Sales are excluded:
// remaining FIFO lots and their costs describe the current unrealized position.
export function computeOpenStockReturn(holdings) {
  const stocks = holdings.filter(h => h.assetType === 'STOCK' && h.qty > EPSILON);
  if (!stocks.length) return 0;
  const asOf = stocks[0].valuationAt;
  if (!asOf || stocks.some(h => h.valuationAt !== asOf || !h.priceAvailable || h.hasDataError)) return null;
  const cashflows = stocks.flatMap(h => h.lots.map(lot => ({
    date: lot.date, amount: lotCost(lot).neg().toNumber(),
  }))).filter(flow => flow.amount !== 0);
  if (!cashflows.length || cashflows.some(flow => !flow.date || flow.date > asOf)) return null;
  cashflows.sort((a, b) => a.date.localeCompare(b.date));
  if (cashflows[0].date === asOf) return null;
  cashflows.push({ date: asOf, amount: sumDecimal(stocks, h => decimalField(h, 'marketValue')).toNumber() });
  return xirr(cashflows);
}

// ─── Portfolio XIRR ───────────────────────────────────────────────────────────

export function computePortfolioXIRR(trades, currentPrices = {}, precomputedHoldings = null) {
  const holdings = precomputedHoldings ?? computeHoldings(trades, currentPrices);

  const cashflows = trades.map(t => {
    const gross = decimal(t.quantity).times(t.price);
    const amount = t.tradeType === 'BUY' ? gross.plus(t.brokerage || 0).neg() : gross.minus(t.brokerage || 0);
    return { date: (t.tradeDate || '').slice(0, 10), amount: amount.toNumber() };
  });

  const termValue = sumDecimal(holdings, h => decimalField(h, 'marketValue'));
  if (termValue.gt(0)) {
    cashflows.push({ date: new Date().toISOString().slice(0, 10), amount: termValue.toNumber() });
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

export function computeCapitalGainsReport(holdings, { fy = currentFinancialYear() } = {}) {
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
        sector: h.sector,
        taxCategory: h.taxCategory || s.taxCategory,
        fy: fyOfTrade,
      });
    }
  }

  // 2. Extract available Financial Years
  const fySet = new Set(allSells.map(s => s.fy).filter(f => f && f !== 'Unknown'));
  fySet.add(currentFinancialYear());
  const availableFys = Array.from(fySet).sort().reverse();

  // 3. Filter for requested FY (unless 'ALL')
  const filteredSells = fy === 'ALL'
    ? allSells
    : allSells.filter(s => s.fy === fy);
  const reviewReasons = new Set();
  if (fy === 'ALL') reviewReasons.add('Select one financial year for tax estimates.');
  if (holdings.some(h => h.hasDataError)) reviewReasons.add('Unmatched sales must be reconciled before estimating tax.');
  for (const sell of filteredSells) for (const lot of sell.matchedLots || []) {
    const reason = equityTaxReview(sell, lot);
    if (reason) reviewReasons.add(`${sell.symbol}: ${reason}`);
  }
  const taxEstimateAvailable = reviewReasons.size === 0;

  // 4. Detailed lot-level breakdown
  let grossLtcg = decimal(0);
  let grossLtcl = decimal(0);
  let grossStcg = decimal(0);
  let grossStcl = decimal(0);

  let stockLtcg = decimal(0), stockLtcl = decimal(0), stockStcg = decimal(0), stockStcl = decimal(0);
  let mfLtcg = decimal(0), mfLtcl = decimal(0), mfStcg = decimal(0), mfStcl = decimal(0);

  const enrichedSells = filteredSells.map(s => {
    let sellLtcg = decimal(0), sellLtcl = decimal(0), sellStcg = decimal(0), sellStcl = decimal(0);
    const isMF = s.assetType === 'MF';

    for (const economicLot of (s.matchedLots || [])) {
      const m = { ...economicLot, gain: decimalField(economicLot, economicLot.taxGain == null ? 'gain' : 'taxGain') };
      if (m.taxType === 'LTCG') {
        if (m.gain.gte(0)) {
          sellLtcg = sellLtcg.plus(m.gain);
          grossLtcg = grossLtcg.plus(m.gain);
          if (isMF) mfLtcg = mfLtcg.plus(m.gain); else stockLtcg = stockLtcg.plus(m.gain);
        } else {
          sellLtcl = sellLtcl.plus(m.gain.abs());
          grossLtcl = grossLtcl.plus(m.gain.abs());
          if (isMF) mfLtcl = mfLtcl.plus(m.gain.abs()); else stockLtcl = stockLtcl.plus(m.gain.abs());
        }
      } else {
        if (m.gain.gte(0)) {
          sellStcg = sellStcg.plus(m.gain);
          grossStcg = grossStcg.plus(m.gain);
          if (isMF) mfStcg = mfStcg.plus(m.gain); else stockStcg = stockStcg.plus(m.gain);
        } else {
          sellStcl = sellStcl.plus(m.gain.abs());
          grossStcl = grossStcl.plus(m.gain.abs());
          if (isMF) mfStcl = mfStcl.plus(m.gain.abs()); else stockStcl = stockStcl.plus(m.gain.abs());
        }
      }
    }

    const totalCost = sumDecimal(s.matchedLots || [], m => decimalField(m, m.taxCostBasis == null ? 'costBasis' : 'taxCostBasis'));
    const totalProceeds = sumDecimal(s.matchedLots || [], m => m.grossProceeds == null ? decimalField(m, 'qty').times(decimalField(s, 'sellPrice')) : decimalField(m, 'grossProceeds'));
    const expenditure = sumDecimal(s.matchedLots || [], m => decimalField(m, 'expenditure'));
    const netGain = totalProceeds.minus(totalCost).minus(expenditure);

    return financialResult({
      ...s,
      totalCost,
      totalProceeds,
      expenditure,
      netGain,
      sellLtcg,
      sellLtcl,
      sellStcg,
      sellStcl,
    });
  });

  // 5. Inter-head Loss Set-off Rules (Income Tax Act):
  // Rule 1: LTCL can ONLY be set off against LTCG.
  const ltclUsedAgainstLtcg = D.min(grossLtcl, grossLtcg);
  const unabsorbedLtcl = grossLtcl.minus(ltclUsedAgainstLtcg);
  let remainingLtcg = grossLtcg.minus(ltclUsedAgainstLtcg);

  // Rule 2: STCL can be set off against STCG first.
  const stclUsedAgainstStcg = D.min(grossStcl, grossStcg);
  let remainingStcl = grossStcl.minus(stclUsedAgainstStcg);
  const netTaxableStcg = grossStcg.minus(stclUsedAgainstStcg);

  // Rule 3: Any remaining STCL can be set off against remaining LTCG
  const stclUsedAgainstLtcg = D.min(remainingStcl, remainingLtcg);
  remainingLtcg = remainingLtcg.minus(stclUsedAgainstLtcg);
  remainingStcl = remainingStcl.minus(stclUsedAgainstLtcg);
  const unabsorbedStcl = remainingStcl;

  // 6. Section 112A LTCG Exemption (₹1,25,000 post Budget 2024):
  const LTCG_EXEMPTION_LIMIT = 125000;
  const exemptLtcg = D.min(remainingLtcg, LTCG_EXEMPTION_LIMIT);
  const taxableLtcg = D.max(0, remainingLtcg.minus(LTCG_EXEMPTION_LIMIT));

  // 7. Tax Liability calculation:
  // LTCG tax @ 12.5% u/s 112A
  const ltcgTax = taxableLtcg.times('0.125');

  // STCG tax @ 20% u/s 111A
  const stcgTax = netTaxableStcg.times('0.20');

  // 4% Health & Education Cess
  const baseTax = ltcgTax.plus(stcgTax);
  const cess = baseTax.times('0.04');
  const totalTax = baseTax.plus(cess);

  const totalRealized = sumDecimal(enrichedSells, s => decimalField(s, s.realized == null ? 'netGain' : 'realized'));

  return financialResult({
    fy,
    taxEstimateAvailable, reviewReasons: [...reviewReasons],
    availableFys,
    totalRealized,
    // LTCG
    grossLtcg,
    grossLtcl,
    netLtcg: grossLtcg.minus(grossLtcl),
    ltclUsedAgainstLtcg,
    unabsorbedLtcl,
    stclUsedAgainstLtcg,
    exemptLtcg: taxEstimateAvailable ? exemptLtcg : null,
    taxableLtcg: taxEstimateAvailable ? taxableLtcg : null,
    ltcgTax: taxEstimateAvailable ? ltcgTax : null,
    // STCG
    grossStcg,
    grossStcl,
    netStcg: grossStcg.minus(grossStcl),
    stclUsedAgainstStcg,
    unabsorbedStcl,
    netTaxableStcg,
    stcgTax: taxEstimateAvailable ? stcgTax : null,
    // Tax summary
    baseTax: taxEstimateAvailable ? baseTax : null,
    cess: taxEstimateAvailable ? cess : null,
    totalTax: taxEstimateAvailable ? totalTax : null,
    // Category Breakdown
    breakdown: {
      stocks: {
        ltcg: stockLtcg.minus(stockLtcl),
        stcg: stockStcg.minus(stockStcl),
        total: stockLtcg.minus(stockLtcl).plus(stockStcg).minus(stockStcl),
        grossLtcg: stockLtcg,
        grossLtcl: stockLtcl,
        grossStcg: stockStcg,
        grossStcl: stockStcl,
      },
      mf: {
        ltcg: mfLtcg.minus(mfLtcl),
        stcg: mfStcg.minus(mfStcl),
        total: mfLtcg.minus(mfLtcl).plus(mfStcg).minus(mfStcl),
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
        remainingStcl: grossStcl.minus(stclUsedAgainstStcg),
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
            const fullValueConsideration = m.grossProceeds == null ? decimalField(m, 'qty').times(decimalField(s, 'sellPrice')) : decimalField(m, 'grossProceeds');
            const costOfAcquisition = decimalField(m, m.taxCostBasis == null ? 'costBasis' : 'taxCostBasis');
            const expenditure = decimalField(m, 'expenditure');
            const gain = fullValueConsideration.minus(costOfAcquisition).minus(expenditure);
            rows.push({
              srNo: srNo++,
              sellDate: s.date,
              isin: s.isin || s.symbol,
              symbol: s.symbol,
              name: s.name || s.symbol,
              assetType: s.assetType,
              quantity: decimalField(m, 'qty'),
              salePrice: decimalField(s, 'sellPrice'),
              fullValueConsideration,
              costOfAcquisition,
              expenditure,
              totalDeductions: costOfAcquisition.plus(expenditure),
              balance: gain,
              deduction54F: 0,
              netLtcg: gain,
              buyDate: m.buyDate,
              buyPrice: decimalField(m, 'buyPrice'),
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
  });
}

export function computeRealizedSummary(holdings, { fy = currentFinancialYear() } = {}) {
  const report = computeCapitalGainsReport(holdings, { fy: 'ALL' });
  const annual = computeCapitalGainsReport(holdings, { fy });
  const sellsBySymbol = {};
  for (const s of report.sells) {
    if (!sellsBySymbol[s.symbol]) sellsBySymbol[s.symbol] = { realized: decimal(0), sells: [] };
    sellsBySymbol[s.symbol].realized = sellsBySymbol[s.symbol].realized.plus(decimalField(s, s.realized == null ? 'netGain' : 'realized'));
    sellsBySymbol[s.symbol].sells.push(s);
  }

  return financialResult({
    totalRealized: sumDecimal(holdings, h => decimalField(h, 'realizedGain')),
    fy, annualReport: annual, taxEstimateAvailable: annual.taxEstimateAvailable,
    ltcgGain: annual.netLtcg,
    stcgGain: annual.netStcg,
    ltcgTax: annual.ltcgTax,
    stcgTax: annual.stcgTax,
    totalTax: annual.totalTax,
    sells: report.sells,
    sellsBySymbol,
  });
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
    if (!map[key]) map[key] = { month: key, amount: decimal(0), activity: decimal(0) };
    const value = decimal(t.quantity).times(t.price);
    if (t.tradeType === 'BUY') {
      map[key].amount = map[key].amount.plus(value);   // invested capital (buy only)
      map[key].activity = map[key].activity.plus(value);
    } else {
      // SELL counts as activity (non-negative) but not as invested capital
      map[key].activity = map[key].activity.plus(value);
    }
  }
  return financialResult(Object.values(map).sort((a, b) => a.month.localeCompare(b.month)));
}

// ─── Tax computation ──────────────────────────────────────────────────────────

export function computeTax(holdings) {
  return holdings.map(h => {
    const isLTCG      = h.years >= 1;
    const taxRate     = isLTCG ? 0.125 : 0.20;
    const taxableGain = D.max(0, decimalField(h, h.unrealizedGain == null ? 'gain' : 'unrealizedGain'));
    const tax = taxableGain.times(String(taxRate));
    return financialResult({ ...h, isLTCG, taxRate, taxableGain, tax });
  });
}

// ─── Tax-Loss Harvesting ───────────────────────────────────────────────────────

export function computeTaxHarvesting(holdings, realizedSummary = {}) {
  const simulation = simulateTaxHarvesting(holdings, realizedSummary.annualReport || {}, {}, 'LOSS');
  return {
    totalHarvestableLoss: sumDecimal(simulation.orders, o => D.max(0, decimalField(o, 'gainOrLoss').neg())).toNumber(),
    stclCandidateLoss: simulation.simulated.harvestedStcl || 0,
    ltclCandidateLoss: simulation.simulated.harvestedLtcl || 0,
    potentialTaxSavings: simulation.impact.immediateTaxSaved,
    realizedSTCG: realizedSummary.annualReport?.grossStcg || 0,
    realizedLTCG: realizedSummary.annualReport?.grossLtcg || 0,
    taxableLTCG: realizedSummary.annualReport?.taxableLtcg || 0,
    candidateLots: simulation.orders.filter(o => o.gainOrLoss < 0).map(o => ({ ...o, qty: o.unitsToSell, unrealizedLoss: -o.gainOrLoss, estimatedSavings: 0 })),
    reviewReasons: simulation.reviewReasons,
  };
}

export function simulateTaxHarvesting(
  holdings = [],
  realizedReport = {},
  lotOverrides = {},
  strategy = 'OPTIMAL'
) {
  const today = new Date();
  const reviewReasons = [...(realizedReport.reviewReasons || [])];
  if (realizedReport.taxEstimateAvailable !== true || realizedReport.fy !== currentFinancialYear()) reviewReasons.push('A verified current-year tax report is required.');
  for (const h of holdings.filter(h => h.qty > EPSILON)) {
    if (!usesEquityTaxRules(h)) reviewReasons.push(`${h.symbol}: tax category is unresolved.`);
    if (!h.priceAvailable) reviewReasons.push(`${h.symbol}: current market price unavailable.`);
    if (h.priceStale) reviewReasons.push(`${h.symbol}: market price is stale or undated.`);
    if (h.hasDataError) reviewReasons.push(`${h.symbol}: unmatched sales exist.`);
    if (h.lots.some(l => l.feesNeedReview || l.date < '2018-02-01')) reviewReasons.push(`${h.symbol}: cost basis or fees require review.`);
  }
  if (reviewReasons.length) return {
    reviewReasons: [...new Set(reviewReasons)], strategy,
    baseline: { totalTax: null, exemptLtcg: null },
    simulated: { totalTax: null, exemptLtcg: null },
    impact: { immediateTaxSaved: 0, harvestedTaxFreeGains: 0, futureLtcgTaxShielded: 0, totalFinancialBenefit: 0, totalProceeds: 0, selectedLotsCount: 0 },
    candidateLots: [], gainCandidates: [], lossCandidates: [], orders: [], effectiveSelections: {},
  };

  // Baseline figures from current FY realized report
  const baseGrossStcg = decimalField(realizedReport, 'grossStcg');
  const baseGrossStcl = decimalField(realizedReport, 'grossStcl');
  const baseGrossLtcg = decimalField(realizedReport, 'grossLtcg');
  const baseGrossLtcl = decimalField(realizedReport, 'grossLtcl');
  const baseTotalTax  = decimalField(realizedReport, 'totalTax');
  const baseExemptLtcg = decimalField(realizedReport, 'exemptLtcg');
  const baseTaxableLtcg = decimalField(realizedReport, 'taxableLtcg');
  const baseTaxableStcg = decimalField(realizedReport, 'netTaxableStcg');

  const LTCG_LIMIT = 125000;
  const remainingLtcgExemption = D.max(0, decimal(LTCG_LIMIT).minus(baseExemptLtcg));

  // 1. Gather all candidate lots across active holdings
  const allCandidateLots = [];

  for (const h of holdings) {
    if (!h.qty || h.qty <= EPSILON || !h.lots || !h.lots.length) continue;
    const cmp = decimalField(h, h.cmp ? 'cmp' : 'avgBuy');

    for (let idx = 0; idx < h.lots.length; idx++) {
      const lot = h.lots[idx];
      if (lot.qty <= EPSILON) continue;
      const lotKey = `${h.instrumentId || h.symbol}_${lot.date || 'unknown'}_${idx}`;
      const lotDate = lot.date ? new Date(lot.date) : today;
      const holdDays = Math.max(0, Math.round((today - lotDate) / (24 * 3600 * 1000)));
      const isLTCG = isLongTermEquity(lot.date, dayKey(today));
      const taxType = isLTCG ? 'LTCG' : 'STCG';

      const costBasis = lot.taxCostBasis == null ? decimalField(lot, 'qty').times(decimalField(lot, lot.taxPrice == null ? 'price' : 'taxPrice')) : decimalField(lot, 'taxCostBasis');
      const currentValue = decimalField(lot, 'qty').times(cmp);
      const unrealizedGain = currentValue.minus(costBasis);
      const isGain = unrealizedGain.gt(EPSILON);
      const isLoss = unrealizedGain.lt(-EPSILON);


      const gainLossPct = costBasis.gt(0) ? unrealizedGain.div(costBasis).times(100) : decimal(0);

      allCandidateLots.push({
        lotKey,
        symbol: h.symbol,
        instrumentId: h.instrumentId,
        isin: h.isin || null,
        name: h.name || h.symbol,
        assetType: h.assetType,
        buyDate: lot.date,
        buyPrice: decimalField(lot, lot.taxPrice == null ? 'price' : 'taxPrice'),
        qty: decimalField(lot, 'qty'),
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
  // Automatic suggestions may consume only a FIFO prefix with the same intent.
  const fifoEligible = (lot, predicate) => {
    const siblings = allCandidateLots.filter(l => l.instrumentId ? l.instrumentId === lot.instrumentId : l.symbol === lot.symbol);
    return siblings.slice(0, siblings.indexOf(lot) + 1).every(predicate);
  };
  const ltcgGainCandidates = allCandidateLots
    .filter(l => l.isGain && l.isLTCG)
    .filter(l => fifoEligible(l, p => p.isGain && p.isLTCG))
    ;

  const lossCandidates = allCandidateLots
    .filter(l => l.isLoss)
    .filter(l => fifoEligible(l, p => p.isLoss))
    .sort((a, b) => {
      // Prioritize STCL (offsets 20% STCG) over LTCL (offsets 12.5% LTCG)
      if (a.taxType !== b.taxType) {
        return a.taxType === 'STCG' ? -1 : 1;
      }
      return a.unrealizedGain.cmp(b.unrealizedGain);
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
        const lossAbs = lot.unrealizedGain.abs();
        if (lot.taxType === 'STCG') {
          if (neededStclOffset > 0 || neededLtcgOffset > 0) {
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: 1 };
            if (neededStclOffset > 0) {
              neededStclOffset = D.max(0, neededStclOffset.minus(lossAbs));
            } else {
              neededLtcgOffset = D.max(0, neededLtcgOffset.minus(lossAbs));
            }
          }
        } else {
          if (neededLtcgOffset > 0) {
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: 1 };
            neededLtcgOffset = D.max(0, neededLtcgOffset.minus(lossAbs));
          }
        }
      }
    }

    // Strategy B / OPTIMAL: Select LTCG winners up to remaining ₹1.25L exemption
    if (strategy === 'GAIN' || strategy === 'OPTIMAL' || strategy === 'ALL') {
      let capRemaining = remainingLtcgExemption;
      for (const lot of ltcgGainCandidates) {
        if (capRemaining > 500) {
          if (lot.unrealizedGain.lte(capRemaining)) {
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: 1 };
            capRemaining = capRemaining.minus(lot.unrealizedGain);
          } else {
            const partialRatio = capRemaining.div(lot.unrealizedGain);
            effectiveSelections[lot.lotKey] = { selected: true, harvestRatio: D.min(1, partialRatio) };
            capRemaining = decimal(0);
          }
        }
      }
    }
  }

  // Convert requested quantities to actual FIFO allocations, including any older lots.
  for (const h of holdings) {
    const siblings = allCandidateLots.filter(l => h.instrumentId ? l.instrumentId === h.instrumentId : l.symbol === h.symbol);
    let requested = sumDecimal(siblings, lot => effectiveSelections[lot.lotKey]?.selected ? lot.qty.times(effectiveSelections[lot.lotKey].harvestRatio) : 0);
    const totalQty = sumDecimal(siblings, lot => lot.qty);
    // A full fund exit consumes exact residual units and cost; partial orders keep unit precision.
    requested = h.assetType !== 'STOCK' && requested.gte(totalQty) ? totalQty
      : h.assetType === 'STOCK' ? requested.plus(EPSILON).floor() : requested.times('1000000').plus(EPSILON).floor().div('1000000');
    for (const lot of siblings) {
      const quantity = D.min(lot.qty, requested);
      effectiveSelections[lot.lotKey] = { selected: quantity > EPSILON, quantity, harvestRatio: quantity.div(lot.qty) };
      requested = D.max(0, requested.minus(quantity));
    }
  }

  // 2. Compute simulated execution impact
  let addHarvestStcg = decimal(0);
  let addHarvestStcl = decimal(0);
  let addHarvestLtcg = decimal(0);
  let addHarvestLtcl = decimal(0);
  let totalProceeds = decimal(0);

  const orders = [];

  for (const lot of allCandidateLots) {
    const sel = effectiveSelections[lot.lotKey] || { selected: false, harvestRatio: 1 };
    lot.isSelected = sel.selected;
    lot.harvestRatio = sel.harvestRatio;
    lot.qtyToSell = sel.selected ? sel.quantity : decimal(0);
    lot.simulatedProceeds = lot.qtyToSell.times(lot.cmp);
    lot.simulatedCost = lot.qtyToSell.eq(lot.qty) ? lot.costBasis : lot.costBasis.times(lot.qtyToSell).div(lot.qty);
    lot.simulatedGain = lot.simulatedProceeds.minus(lot.simulatedCost);

    if (sel.selected && lot.qtyToSell > EPSILON) {
      totalProceeds = totalProceeds.plus(lot.simulatedProceeds);

      if (lot.isLTCG) {
        if (lot.simulatedGain >= 0) addHarvestLtcg = addHarvestLtcg.plus(lot.simulatedGain);
        else                        addHarvestLtcl = addHarvestLtcl.plus(lot.simulatedGain.abs());
      } else {
        if (lot.simulatedGain >= 0) addHarvestStcg = addHarvestStcg.plus(lot.simulatedGain);
        else                        addHarvestStcl = addHarvestStcl.plus(lot.simulatedGain.abs());
      }

      orders.push({
        lotKey: lot.lotKey,
        symbol: lot.symbol,
        instrumentId: lot.instrumentId,
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
  const combGrossStcg = baseGrossStcg.plus(addHarvestStcg);
  const combGrossStcl = baseGrossStcl.plus(addHarvestStcl);
  const combGrossLtcg = baseGrossLtcg.plus(addHarvestLtcg);
  const combGrossLtcl = baseGrossLtcl.plus(addHarvestLtcl);

  const simLtclUsedAgainstLtcg = D.min(combGrossLtcl, combGrossLtcg);
  let simRemLtcg = combGrossLtcg.minus(simLtclUsedAgainstLtcg);
  const simUnabsorbedLtcl = combGrossLtcl.minus(simLtclUsedAgainstLtcg);

  const simStclUsedAgainstStcg = D.min(combGrossStcl, combGrossStcg);
  let simRemStcl = combGrossStcl.minus(simStclUsedAgainstStcg);
  const simNetTaxableStcg = combGrossStcg.minus(simStclUsedAgainstStcg);

  const simStclUsedAgainstLtcg = D.min(simRemStcl, simRemLtcg);
  simRemLtcg = simRemLtcg.minus(simStclUsedAgainstLtcg);
  simRemStcl = simRemStcl.minus(simStclUsedAgainstLtcg);
  const simUnabsorbedStcl = simRemStcl;

  const simExemptLtcg = D.min(simRemLtcg, LTCG_LIMIT);
  const simTaxableLtcg = D.max(0, simRemLtcg.minus(LTCG_LIMIT));

  const simLtcgTax = simTaxableLtcg.times('0.125');
  const simStcgTax = simNetTaxableStcg.times('0.20');
  const simBaseTax = simLtcgTax.plus(simStcgTax);
  const simCess = simBaseTax.times('0.04');
  const simTotalTax = simBaseTax.plus(simCess);

  const immediateTaxSaved = D.max(0, baseTotalTax.minus(simTotalTax));
  const harvestedTaxFreeGains = D.max(0, simExemptLtcg.minus(baseExemptLtcg));
  const futureLtcgTaxShielded = harvestedTaxFreeGains.times('0.125');
  const totalFinancialBenefit = immediateTaxSaved.plus(futureLtcgTaxShielded);

  return financialResult({
    reviewReasons: [],
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
  });
}

// ─── Schedule 112A & Tax Export Generators ────────────────────────────────────

export function generateSchedule112ACsv(report, { reconciliation = false } = {}) {
  if (!reconciliation) requireVerifiedTaxReport(report);
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
    String(row.quantity),
    decimalField(row, 'salePrice').toFixed(2),
    decimalField(row, 'fullValueConsideration').toFixed(2),
    decimalField(row, 'costOfAcquisition').toFixed(2),
    decimalField(row, 'costOfAcquisition').toFixed(2),
    '0.00',
    '0.00',
    decimalField(row, 'expenditure').toFixed(2),
    decimalField(row, 'costOfAcquisition').plus(decimalField(row, 'expenditure')).toFixed(2),
    '0.00',
    decimalField(row, 'costOfAcquisition').toFixed(2),
    decimalField(row, 'netLtcg').toFixed(2),
    '0.00',
    decimalField(row, 'netLtcg').toFixed(2),
  ]);

  return [...taxExportWarnings(report), headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function generateSchedule112AJson(report, { reconciliation = false } = {}) {
  if (!reconciliation) requireVerifiedTaxReport(report);
  const ay = report.fy && report.fy !== 'ALL'
    ? `${parseInt(report.fy.slice(0, 4), 10) + 1}-${String(parseInt(report.fy.slice(5, 7), 10) + 1).padStart(2, '0')}`
    : null;

  return JSON.stringify({
    schemaVersion: 'portfin-112a-reconciliation-v1',
    financialYear: report.fy || '2026-27',
    assessmentYear: ay,
    generatedAt: new Date().toISOString(),
    taxEstimateAvailable: report.taxEstimateAvailable,
    reviewReasons: report.reviewReasons || [],
    summary: {
      totalTransactions: report.schedule112A?.length || 0,
      grossLtcg: report.grossLtcg || 0,
      exemptLtcgSec112A: report.exemptLtcg,
      taxableLtcg: report.taxableLtcg,
      ltcgTaxPayable: report.ltcgTax,
      stcgTaxPayable: report.stcgTax,
      totalTaxPayable: report.totalTax,
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
      transferExpenditure: row.expenditure || 0,
      totalDeductions: decimalField(row, 'costOfAcquisition').plus(decimalField(row, 'expenditure')).toNumber(),
      balance: row.netLtcg,
      deduction54F: 0,
      netLtcg: row.netLtcg,
      saleDate: row.sellDate,
      matchedBuyDate: row.buyDate,
      holdingPeriodDays: row.holdDays,
    })),
  }, null, 2);
}

export function generateSchedule111ACsv(report, { reconciliation = false } = {}) {
  if (!reconciliation) requireVerifiedTaxReport(report);
  const ay = report.fy && report.fy !== 'ALL'
    ? `${parseInt(report.fy.slice(0, 4), 10) + 1}-${String(parseInt(report.fy.slice(5, 7), 10) + 1).padStart(2, '0')}`
    : 'Multiple assessment years';

  const stcgRows = [];
  let srNo = 1;
  let totalProceeds = decimal(0);
  let totalCost = decimal(0);
  let totalExpenditure = decimal(0);

  for (const s of (report.sells || [])) {
    const stcgLots = (s.matchedLots || []).filter(m => m.taxType === 'STCG');
    if (stcgLots.length > 0) {
      for (const m of stcgLots) {
        const proceeds = m.grossProceeds == null ? decimalField(m, 'qty').times(decimalField(s, 'sellPrice')) : decimalField(m, 'grossProceeds');
        const cost = decimalField(m, m.taxCostBasis == null ? 'costBasis' : 'taxCostBasis');
        const expenditure = decimalField(m, 'expenditure');
        const gain = proceeds.minus(cost).minus(expenditure);
        totalProceeds = totalProceeds.plus(proceeds);
        totalCost = totalCost.plus(cost);
        totalExpenditure = totalExpenditure.plus(expenditure);

        stcgRows.push([
          srNo++,
          s.date,
          m.buyDate,
          m.holdDays,
          s.isin || s.symbol,
          `"${(s.name || s.symbol).replace(/"/g, '""')}"`,
          s.assetType === 'MF' ? 'Mutual Fund' : 'Equity Share',
          String(m.qty),
          decimalField(s, 'sellPrice').toFixed(2),
          proceeds.toFixed(2),
          decimalField(m, 'buyPrice').toFixed(2),
          cost.toFixed(2),
          expenditure.toFixed(2),
          gain.toFixed(2),
        ]);
      }
    } else if (s.taxType === 'STCG') {
      const proceeds = s.totalProceeds == null ? decimalField(s, 'qty').times(decimalField(s, 'sellPrice')) : decimalField(s, 'totalProceeds');
      const cost = decimalField(s, 'totalCost');
      const gain = s.netGain == null ? proceeds.minus(cost) : decimalField(s, 'netGain');
      totalProceeds = totalProceeds.plus(proceeds);
      totalCost = totalCost.plus(cost);

      stcgRows.push([
        srNo++,
        s.date,
        '',
        '',
        s.isin || s.symbol,
        `"${(s.name || s.symbol).replace(/"/g, '""')}"`,
        s.assetType === 'MF' ? 'Mutual Fund' : 'Equity Share',
        typeof s.qty === 'number' ? s.qty.toFixed(s.assetType === 'MF' ? 3 : 0) : s.qty,
        decimalField(s, 'sellPrice').toFixed(2),
        proceeds.toFixed(2),
        '',
        cost.toFixed(2),
        '0.00',
        gain.toFixed(2),
      ]);
    }
  }

  const netStcg = totalProceeds.minus(totalCost).minus(totalExpenditure);

  const summaryLines = [
    '# ITR-2 SCHEDULE CG — SECTION 111A (SHORT-TERM CAPITAL GAINS TAXABLE @ 20%)',
    `# Financial Year: ${report.fy || '2026-27'},Assessment Year: ${ay}`,
    '# ---------------------------------------------------------------------------------',
    '# SECTION 111A RECONCILIATION SUMMARY — REVIEW BEFORE FILING:',
    `# 1. Full Value of Consideration (Gross Short-Term Sale Proceeds):,${totalProceeds.toFixed(2)}`,
    `# 2. Cost of Acquisition without indexation (FIFO Basis):,${totalCost.toFixed(2)}`,
    `# 3. Expenditure incurred wholly and exclusively in connection with transfer:,${totalExpenditure.toFixed(2)}`,
    `# 4. Total Deductions (Cost + Expenditure):,${totalCost.plus(totalExpenditure).toFixed(2)}`,
    `# 5. Net Short-Term Capital Gain u/s 111A:,${netStcg.toFixed(2)}`,
    `# 6. STCL Set-off against STCG:,${decimalField(report, 'stclUsedAgainstStcg').toFixed(2)}`,
    `# 7. Net Taxable STCG (Taxable @ 20%):,${report.taxEstimateAvailable ? decimalField(report, 'netTaxableStcg').toFixed(2) : 'Unavailable'}`,
    `# 8. Estimated STCG Tax @ 20% + 4% Cess:,${report.taxEstimateAvailable ? decimalField(report, 'stcgTax').times('1.04').toFixed(2) : 'Unavailable'}`,
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
    ...taxExportWarnings(report),
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
    String(o.unitsToSell),
    decimalField(o, 'cmp').toFixed(2),
    decimalField(o, 'estimatedProceeds').toFixed(2),
    decimalField(o, 'costBasis').toFixed(2),
    decimalField(o, 'gainOrLoss').toFixed(2),
    o.taxType,
    `"${(o.strategyAction || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// ─── Wealth projection ────────────────────────────────────────────────────────
function requireVerifiedTaxReport(report) {
  if (!report.taxEstimateAvailable || report.fy === 'ALL') throw new Error('Tax eligibility, fees, acquisition history and one financial year must be verified before export.');
}

function taxExportWarnings(report) {
  if (report.taxEstimateAvailable) return [];
  return ['# RECONCILIATION ONLY — tax estimate unavailable; schedule eligibility requires review.',
    ...(report.reviewReasons || []).map(reason => `# ${reason.replace(/[\r\n]/g, ' ')}`)];
}

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
  const weight = m => (decimalField(m, 'gain').isZero() ? decimalField(m, 'costBasis') : decimalField(m, 'gain')).abs();
  const ltcgGain = sumDecimal(matchedLots.filter(m => m.taxType === 'LTCG'), weight);
  const stcgGain = sumDecimal(matchedLots.filter(m => m.taxType === 'STCG'), weight);
  return ltcgGain.gte(stcgGain) ? 'LTCG' : 'STCG';
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
