import { computeCapitalGainsReport } from './store.js';
import { decimal, decimalField, sumDecimal } from './financialDecimal.js';
import { usesEquityTaxRules } from './financialRules.js';

const money = n => decimal(n).toDecimalPlaces(2).toNumber();
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

// Dates determine the term per lot; unknown sale eligibility needs confirmation.
export function classifyForIncomeTax(sell, lot, decision) {
  const review = reason => ({ kind: 'review', asset: 'other', confirmed: false, reason });
  if (!validDate(lot.buyDate) || !validDate(sell.date) || lot.buyDate > sell.date)
    return review('Missing or inconsistent FIFO acquisition/sale dates.');
  decision ||= usesEquityTaxRules(sell) ? 'equity' : null;
  if (!decision) return review('Tax category or sale-level STT eligibility is unresolved. Confirm the applicable provision for this sale.');
  if (decision === 'equity') {
    if (sell.sttEligible === false) return review('This sale does not meet the required STT conditions.');
    if (!['STOCK', 'MF'].includes(sell.assetType)) return review('Unsupported equity asset type.');
    const anniversary = new Date(lot.buyDate);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    const long = sell.date > anniversary.toISOString().slice(0, 10);
    if (long !== (lot.taxType === 'LTCG')) return review('PortFin holding-period classification differs from the calendar anniversary rule.');
    if (long && lot.buyDate < '2018-02-01') return review('Grandfathering requires a separately verified cost basis.');
    return { kind: long ? '112A' : '111A', asset: 'equity', confirmed: true, reason: '' };
  }
  if (decision === 'otherSTCG' || decision === '112')
    return { kind: decision, asset: 'other', confirmed: true, reason: '' };
  return review('Unsupported classification decision.');
}

export function buildIncomeTaxExport(holdings, { fy, classifications = {}, saleClassifications = {}, trades } = {}) {
  if (!/^\d{4}-\d{2}$/.test(fy) || String(Number(fy.slice(0, 4)) + 1).slice(-2) !== fy.slice(-2))
    throw new Error('Select one valid financial year.');
  const report = computeCapitalGainsReport(holdings, { fy });
  const warnings = [];
  if (trades) {
    const start = `${fy.slice(0, 4)}-04-01`;
    const end = `${Number(fy.slice(0, 4)) + 1}-03-31`;
    const expected = new Map();
    for (const t of trades.filter(t => t.tradeType === 'SELL' && t.tradeDate.slice(0, 10) >= start && t.tradeDate.slice(0, 10) <= end)) {
      const key = JSON.stringify([t.symbol, t.tradeDate.slice(0, 10)]);
      expected.set(key, decimal(expected.get(key)).plus(t.quantity));
    }
    for (const s of report.sells) {
      const key = JSON.stringify([s.symbol, s.date]);
      expected.set(key, decimal(expected.get(key)).minus(decimalField(s, 'qty')));
    }
    if ([...expected.values()].some(n => !n.isFinite() || n.abs().gt('0.000001'))) warnings.push('Sale quantities do not reconcile with the FIFO report. Some sales may have no matching purchases.');
  }
  if (holdings.some(h => h.hasDataError)) warnings.push('Unmatched sales exist in the portfolio; the FIFO report may omit proceeds. Reconcile all trades before relying on an estimate.');
  const gains = [];
  for (const [saleIndex, sell] of report.sells.entries()) {
    if (!sell.matchedLots?.length) warnings.push(`Missing FIFO lots for ${sell.symbol} on ${sell.date}.`);
    for (const [lotIndex, lot] of (sell.matchedLots || []).entries()) {
      let classification = classifyForIncomeTax(sell, lot, saleClassifications[`sale-${saleIndex + 1}`] ?? classifications[sell.symbol]);
      if (lot.feesNeedReview) classification = { kind: 'review', asset: 'other', confirmed: false, reason: 'Deductible transaction fees require review; STT cannot be inferred from total fees.' };
      const numbers = [lot.qty, lot.costBasis, lot.gain, lot.holdDays, sell.sellPrice];
      if (numbers.some(n => !Number.isFinite(n))) throw new Error('Non-finite FIFO values require correction before export.');
      gains.push({
        id: `sale-${saleIndex + 1}-lot-${lotIndex + 1}`,
        transaction: `sale-${saleIndex + 1}`,
        ...classification,
        instrument: { symbol: sell.symbol, name: sell.name, isin: sell.isin || '', exchange: sell.exchange || '' },
        acquired: lot.buyDate, sold: sell.date, quantity: lot.qty,
        saleProceeds: money(lot.grossProceeds == null ? decimalField(lot, 'qty').times(decimalField(sell, 'sellPrice')) : decimalField(lot, 'grossProceeds')),
        costBasis: money(decimalField(lot, lot.taxCostBasis == null ? 'costBasis' : 'taxCostBasis')),
        transferExpenditure: money(decimalField(lot, 'expenditure')),
        gain: money(decimalField(lot, lot.taxGain == null ? 'gain' : 'taxGain')), holdingDays: lot.holdDays, source: 'fifo',
      });
    }
  }
  const summary = Object.fromEntries(['section111A', 'section112A', 'otherSTCG', 'otherLTCG', 'review'].map(k => [k, { gain: 0, loss: 0 }]));
  const bucket = { '111A': 'section111A', '112A': 'section112A', otherSTCG: 'otherSTCG', '112': 'otherLTCG', review: 'review' };
  for (const g of gains) {
    const row = summary[bucket[g.kind]];
    const field = g.gain < 0 ? 'loss' : 'gain';
    row[field] = money(decimal(row[field]).plus(decimal(g.gain).abs()));
  }
  return {
    schemaVersion: 1, source: 'portfin', financialYear: fy, generatedAt: new Date().toISOString(),
    summary, gains, warnings,
    reconciliation: {
      transactionCount: report.sells.length, gainCount: gains.length,
      reviewCount: gains.filter(g => g.kind === 'review' || g.gain < 0).length,
      totalGain: money(sumDecimal(gains, g => g.gain)),
    },
  };
}
