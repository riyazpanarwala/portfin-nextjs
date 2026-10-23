import { createHash } from 'node:crypto';
import { HttpError } from './auth.js';
import { flattenTrade } from './apiHelpers.js';
import { tradeOrder } from './ledger.js';
import { ENGINE_VERSION, isVerifiedSnapshot, isUserVerifiedSnapshot } from './financialRules.js';
import { snapshotWithStockReturn } from './snapshotValuation.js';

export function createSnapshotReader({ now = Date.now, ttl = 60000, maxEntries = 1000, calculate = snapshotWithStockReturn } = {}) {
  const cache = new Map();
  return async function readSnapshots(db, session, portfolioId, limit) {
    if (typeof portfolioId !== 'string' || !portfolioId) throw new HttpError(400, 'portfolioId required');
    const loaded = await db.$transaction(async tx => {
      const portfolio = await tx.portfolio.findFirst({ where: { id: portfolioId, userId: session.userId }, select: { revision: true } });
      if (!portfolio) throw new HttpError(404, 'Portfolio not found');
      const saved = await tx.snapshot.findMany({ where: { portfolioId }, orderBy: { snapshotAt: 'desc' }, take: limit });
      const items = saved.map(snapshot => {
        // Fingerprint the whole row so same-minute saves and verification changes invalidate corrections.
        const key = createHash('sha256').update(JSON.stringify([session.userId, portfolioId, portfolio.revision, ENGINE_VERSION, snapshot])).digest('hex');
        const cached = cache.get(key);
        const correction = cached && now() - cached.at < ttl ? cached.correction : null;
        const needsLedger = !correction && isVerifiedSnapshot(snapshot) && !isUserVerifiedSnapshot(snapshot) && !!snapshot.priceProvenance;
        return { snapshot, key, correction, needsLedger };
      });
      if (!items.some(item => item.needsLedger)) return { items, trades: [], actions: [] };
      const trades = await tx.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder });
      const actions = await tx.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
      return { items, trades: trades.map(flattenTrade), actions };
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
