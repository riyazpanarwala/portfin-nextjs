import { computeHoldings, computePortfolioStats } from './store.js';
import { ENGINE_VERSION, dayKey } from './financialRules.js';

export function buildSnapshotData(trades, prices, meta, { asOf, corporateActions = [], revision }) {
  if (dayKey(asOf) !== asOf) throw new Error('Invalid snapshot date');
  const holdings = computeHoldings(trades, prices, { asOf, corporateActions });
  if (holdings.some(h => h.hasDataError)) throw new Error('Unmatched sales prevent a reliable snapshot.');
  const provenance = {};
  for (const holding of holdings.filter(h => h.qty > 1e-9)) {
    const key = holding.instrumentId || holding.symbol;
    const record = meta[key];
    if (!holding.priceAvailable || !record?.asOf || !Number.isFinite(Date.parse(record.asOf)) || dayKey(record.asOf) !== record.asOf || record.asOf > asOf || Date.parse(asOf) - Date.parse(record.asOf) > 7 * 86400000) throw new Error(`Missing or stale valuation price for ${holding.symbol} on ${asOf}`);
    provenance[key] = { price: holding.cmp, asOf: record.asOf, source: record.providerSource || record.source || 'unknown' };
  }
  const stats = computePortfolioStats(holdings);
  const fields = ['totalValue', 'totalInvested', 'totalGain', 'totalReturnPct', 'totalRealizedGain', 'mfCagr', 'stCagr', 'mfInvested', 'stInvested', 'fundCount', 'stockCount'];
  if (fields.some(key => !Number.isFinite(stats[key]))) throw new Error('Non-finite snapshot values');
  return { ...Object.fromEntries(fields.map(key => [key, stats[key]])), valuationAt: new Date(asOf), ledgerRevision: revision, priceProvenance: provenance, engineVersion: ENGINE_VERSION, stale: false };
}

export function cachedValuationInputs(instruments) {
  const prices = {}, meta = {};
  for (const instrument of instruments) {
    prices[instrument.id] = instrument.price == null ? null : Number(instrument.price);
    meta[instrument.id] = { asOf: instrument.priceAsOf ? dayKey(instrument.priceAsOf) : null, source: instrument.priceSource || 'unknown' };
  }
  return { prices, meta };
}
