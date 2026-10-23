import { HttpError } from './auth.js';
import { flattenTrade } from './apiHelpers.js';
import { tradeOrder } from './ledger.js';
import { collectInstrumentPrices } from './priceService.js';

const PAGE_SIZE = 1000;

export async function bootstrapPortfolio(db, session, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Invalid bootstrap request');
  const { portfolioId, offset = 0, revision } = input;
  if ((portfolioId !== undefined && (typeof portfolioId !== 'string' || !portfolioId || portfolioId.length > 64)) ||
      !Number.isSafeInteger(offset) || offset < 0 ||
      (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) ||
      (offset > 0 && (!portfolioId || revision === undefined))) {
    throw new HttpError(400, 'Invalid bootstrap pagination');
  }

  // Every page observes one consistent ledger without blocking writers with a row lock.
  const page = await db.$transaction(async tx => {
    let portfolio = await tx.portfolio.findFirst({
      where: { userId: session.userId, ...(portfolioId ? { id: portfolioId } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, revision: true },
    });
    if (!portfolio) {
      if (portfolioId) throw new HttpError(404, 'Portfolio not found');
      portfolio = await tx.portfolio.create({
        data: { userId: session.userId, name: 'My Portfolio' },
        select: { id: true, revision: true },
      });
    }
    if (revision !== undefined && revision !== portfolio.revision) {
      throw new HttpError(409, 'Portfolio changed during loading. Reload the history.');
    }
    const where = { portfolioId: portfolio.id };
    const [trades, total, corporateActions] = await Promise.all([
      tx.trade.findMany({ where, include: { instrument: true }, orderBy: tradeOrder, take: PAGE_SIZE, skip: offset }),
      tx.trade.count({ where }),
      offset === 0 ? tx.corporateAction.findMany({ where, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] }) : Promise.resolve([]),
    ]);
    return { portfolioId: portfolio.id, revision: portfolio.revision, trades, total, corporateActions };
  }, { isolationLevel: 'RepeatableRead' });

  const instruments = [...new Map(page.trades.map(trade => [trade.instrumentId, trade.instrument])).values()];
  // cacheOnly never calls a market provider or writes prices back to the database.
  const cached = await collectInstrumentPrices(instruments, { cacheOnly: true });
  // Use stable IDs: symbols can be shared by instruments across exchanges/pages.
  const prices = {}, meta = {};
  for (const instrument of instruments) {
    if (cached.prices[instrument.id] !== undefined) prices[instrument.id] = cached.prices[instrument.id];
    meta[instrument.id] = cached.meta[instrument.id];
  }
  return {
    ...page,
    trades: page.trades.map(flattenTrade),
    hasMore: offset + page.trades.length < page.total,
    prices,
    meta,
  };
}
