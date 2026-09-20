import { computeCapitalGainsReport } from './store.js';

const money = n => Number(n.toFixed(2));
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

// A decision is an explicit user attestation, never inferred from a fund name.
export function classifyForIncomeTax(sell, lot, decision) {
  const review = reason => ({ kind: 'review', asset: 'other', confirmed: false, reason });
  if (!validDate(lot.buyDate) || !validDate(sell.date) || lot.buyDate > sell.date)
    return review('Missing or inconsistent FIFO acquisition/sale dates.');
  if (!decision) return review('Tax eligibility and STT conditions are not stored in PortFin. Review the instrument and select its applicable provision.');
  if (decision === 'equity') {
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

export function buildIncomeTaxExport(holdings, { fy, classifications = {}, trades } = {}) {
  if (!/^\d{4}-\d{2}$/.test(fy) || String(Number(fy.slice(0, 4)) + 1).slice(-2) !== fy.slice(-2))
    throw new Error('Select one valid financial year.');
  const report = computeCapitalGainsReport(holdings, { fy });
  const warnings = [];
  if (trades) {
    if (trades.length >= 1000) warnings.push('The loaded portfolio reached the trade API limit. Confirm the complete trade history before relying on an estimate.');
    const start = `${fy.slice(0, 4)}-04-01`;
    const end = `${Number(fy.slice(0, 4)) + 1}-03-31`;
    const expected = new Map();
    for (const t of trades.filter(t => t.tradeType === 'SELL' && t.tradeDate.slice(0, 10) >= start && t.tradeDate.slice(0, 10) <= end)) {
      const key = JSON.stringify([t.symbol, t.tradeDate.slice(0, 10)]);
      expected.set(key, (expected.get(key) || 0) + Number(t.quantity));
    }
    for (const s of report.sells) {
      const key = JSON.stringify([s.symbol, s.date]);
      expected.set(key, (expected.get(key) || 0) - s.qty);
    }
    if ([...expected.values()].some(n => !Number.isFinite(n) || Math.abs(n) > 1e-6)) warnings.push('Sale quantities do not reconcile with the FIFO report. Some sales may have no matching purchases.');
  }
  if (holdings.some(h => h.hasDataError)) warnings.push('Unmatched sales exist in the portfolio; the FIFO report may omit proceeds. Reconcile all trades before relying on an estimate.');
  const gains = [];
  for (const [saleIndex, sell] of report.sells.entries()) {
    if (!sell.matchedLots?.length) warnings.push(`Missing FIFO lots for ${sell.symbol} on ${sell.date}.`);
    for (const [lotIndex, lot] of (sell.matchedLots || []).entries()) {
      const classification = classifyForIncomeTax(sell, lot, classifications[sell.symbol]);
      const numbers = [lot.qty, lot.costBasis, lot.gain, lot.holdDays, sell.sellPrice];
      if (numbers.some(n => !Number.isFinite(n))) throw new Error('Non-finite FIFO values require correction before export.');
      gains.push({
        id: `sale-${saleIndex + 1}-lot-${lotIndex + 1}`,
        transaction: `sale-${saleIndex + 1}`,
        ...classification,
        instrument: { symbol: sell.symbol, name: sell.name, isin: sell.isin || '', exchange: sell.exchange || '' },
        acquired: lot.buyDate, sold: sell.date, quantity: lot.qty,
        saleProceeds: money(lot.qty * sell.sellPrice), costBasis: money(lot.costBasis),
        gain: money(lot.gain), holdingDays: lot.holdDays, source: 'fifo',
      });
    }
  }
  const summary = Object.fromEntries(['section111A', 'section112A', 'otherSTCG', 'otherLTCG', 'review'].map(k => [k, { gain: 0, loss: 0 }]));
  const bucket = { '111A': 'section111A', '112A': 'section112A', otherSTCG: 'otherSTCG', '112': 'otherLTCG', review: 'review' };
  for (const g of gains) {
    const row = summary[bucket[g.kind]];
    const field = g.gain < 0 ? 'loss' : 'gain';
    row[field] = money(row[field] + Math.abs(g.gain));
  }
  return {
    schemaVersion: 1, source: 'portfin', financialYear: fy, generatedAt: new Date().toISOString(),
    summary, gains, warnings,
    reconciliation: {
      transactionCount: report.sells.length, gainCount: gains.length,
      reviewCount: gains.filter(g => g.kind === 'review' || g.gain < 0).length,
      totalGain: money(gains.reduce((sum, g) => sum + g.gain, 0)),
    },
  };
}
