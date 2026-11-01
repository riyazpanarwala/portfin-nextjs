import { createHash } from 'node:crypto';
import { HttpError } from './auth.js';
import { flattenTrade } from './apiHelpers.js';
import { tradeOrder } from './ledger.js';
import { ENGINE_VERSION, isVerifiedSnapshot, isUserVerifiedSnapshot } from './financialRules.js';
import { buildSnapshotData, snapshotWithStockReturn } from './snapshotValuation.js';
import { isDelistedStock } from './marketDataPolicy.js';

function rebuildFromSavedPrices(snapshot, trades, instruments, actions, revision) {
  if (!snapshot.valuationAt || !snapshot.priceProvenance || !['fifo-v2', ENGINE_VERSION].includes(snapshot.engineVersion)) return null;
  const prices = {}, meta = {};
  for (const [key, record] of Object.entries(snapshot.priceProvenance)) {
    if (record?.price == null) return null;
    prices[key] = record.price;
    meta[key] = record;
  }
  const asOf = snapshot.valuationAt.toISOString().slice(0, 10);
  // A holding may have been added to the ledger after the checkpoint was
  // saved, so its ID is absent from that checkpoint's price provenance. Use a
  // cached quote only when it predates the checkpoint and meets the same
  // freshness rule used when the original checkpoint was built. Delisted
  // holdings can use their last known quote because they no longer trade.
  for (const instrument of instruments) {
    if (meta[instrument.id]?.asOf && meta[instrument.id].asOf <= asOf) continue;
    const price = instrument.price?.toString();
    const priceAsOf = instrument.priceAsOf?.toISOString().slice(0, 10);
    const delisted = isDelistedStock(instrument);
    const ageDays = priceAsOf ? (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${priceAsOf}T00:00:00Z`)) / 86400000 : Infinity;
    if (!price || !Number.isFinite(Number(price)) || Number(price) <= 0 || !priceAsOf || priceAsOf > asOf || (!delisted && ageDays > 7)) continue;
    prices[instrument.id] = price;
    meta[instrument.id] = { price, asOf: priceAsOf, source: instrument.priceSource || 'last-known-delisted-price' };
  }
  try {
    return buildSnapshotData(trades, prices, meta, {
      asOf,
      corporateActions: actions,
      revision,
    });
  } catch {
    return null;
  }
}

export function createSnapshotReader({ now = Date.now, ttl = 60000, maxEntries = 1000, calculate = snapshotWithStockReturn } = {}) {
  const cache = new Map();
  return async function readSnapshots(db, session, portfolioId, limit) {
    if (typeof portfolioId !== 'string' || !portfolioId) throw new HttpError(400, 'portfolioId required');
    const loaded = await db.$transaction(async tx => {
      const portfolio = await tx.portfolio.findFirst({ where: { id: portfolioId, userId: session.userId }, select: { revision: true } });
      if (!portfolio) throw new HttpError(404, 'Portfolio not found');
      const saved = await tx.snapshot.findMany({ where: { portfolioId }, orderBy: { snapshotAt: 'desc' }, take: limit });
      let trades = [], actions = [];
      const needsRebuild = saved.some(snapshot => snapshot.stale && snapshot.valuationAt && snapshot.priceProvenance);
      let instruments = [];
      if (needsRebuild) {
        const rawTrades = await tx.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder });
        instruments = [...new Map(rawTrades.map(trade => [trade.instrumentId, trade.instrument])).values()];
        trades = rawTrades.map(flattenTrade);
        actions = await tx.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
        for (const snapshot of saved) {
          if (!snapshot.stale) continue;
          const rebuilt = rebuildFromSavedPrices(snapshot, trades, instruments, actions, portfolio.revision);
          if (!rebuilt) continue;
          // Rebuild with the checkpoint's recorded prices. This safely clears
          // stale flags from metadata-only updates and repairs historical totals
          // when relevant ledger changes actually affected the checkpoint.
          await tx.snapshot.update({ where: { id: snapshot.id }, data: rebuilt });
          Object.assign(snapshot, rebuilt);
        }
      }
      const items = saved.map(snapshot => {
        // Fingerprint the whole row so same-minute saves and verification changes invalidate corrections.
        const key = createHash('sha256').update(JSON.stringify([session.userId, portfolioId, portfolio.revision, ENGINE_VERSION, snapshot])).digest('hex');
        const cached = cache.get(key);
        const correction = cached && now() - cached.at < ttl ? cached.correction : null;
        const needsLedger = !correction && isVerifiedSnapshot(snapshot) && !isUserVerifiedSnapshot(snapshot) && !!snapshot.priceProvenance;
        return { snapshot, key, correction, needsLedger };
      });
      if (!items.some(item => item.needsLedger) && !trades.length) return { items, trades: [], actions: [] };
      if (!trades.length && items.some(item => item.needsLedger)) {
        trades = (await tx.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder })).map(flattenTrade);
        actions = await tx.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
      }
      return { items, trades, actions };
    }, { isolationLevel: 'RepeatableRead', timeout: 20000 });

    // Release the database transaction before running historical calculations.
    return loaded.items.map(({ snapshot, key, correction, needsLedger }) => {
      if (!correction) {
        const result = needsLedger ? calculate(snapshot, loaded.trades, loaded.actions) : { stCagr: null, stockReturnMethod: 'unavailable' };
        correction = { stCagr: result.stCagr, stockReturnMethod: result.stockReturnMethod };
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { at: now(), correction });
      }
      return { ...snapshot, ...correction };
    });
  };
}

export const readSnapshots = createSnapshotReader();
