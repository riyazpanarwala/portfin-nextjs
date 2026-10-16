import { computeHoldings, computePortfolioStats } from './store.js';
import { ENGINE_VERSION, dayKey, isVerifiedSnapshot, isUserVerifiedSnapshot } from './financialRules.js';
import { decimalField } from './financialDecimal.js';

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
  if (fields.some(key => !(key === 'stCagr' && stats[key] === null) && !Number.isFinite(stats[key]))) throw new Error('Non-finite snapshot values');
  // Pass decimal strings directly to Prisma; never round-trip money through a JS Number.
  return { ...Object.fromEntries(fields.map(key => [key, stats[key] === null || ['fundCount', 'stockCount'].includes(key) ? stats[key] : decimalField(stats, key).toFixed(2)])), valuationAt: new Date(asOf), ledgerRevision: revision, priceProvenance: provenance, engineVersion: ENGINE_VERSION, stale: false };
}

// Correct saved stock returns from the recorded historical prices, never from
// today's prices. Preserve saved valuations and their verification status.
export function snapshotWithStockReturn(snapshot, trades, corporateActions = []) {
  const unavailable = { ...snapshot, stCagr: null, stockReturnMethod: 'unavailable' };
  if (!isVerifiedSnapshot(snapshot) || isUserVerifiedSnapshot(snapshot) || !snapshot.priceProvenance) return unavailable;
  const prices = {}, meta = {};
  for (const [key, record] of Object.entries(snapshot.priceProvenance)) {
    prices[key] = record.price;
    meta[key] = record;
  }
  try {
    const data = buildSnapshotData(trades, prices, meta, { asOf: dayKey(snapshot.valuationAt), corporateActions, revision: snapshot.ledgerRevision });
    return { ...snapshot, stCagr: data.stCagr, stockReturnMethod: 'open-lot-xirr' };
  } catch {
    return unavailable;
  }
}

export function cachedValuationInputs(instruments) {
  const prices = {}, meta = {};
  for (const instrument of instruments) {
    prices[instrument.id] = instrument.price == null ? null : instrument.price.toString();
    meta[instrument.id] = { asOf: instrument.priceAsOf ? dayKey(instrument.priceAsOf) : null, source: instrument.priceSource || 'unknown' };
  }
  return { prices, meta };
}
