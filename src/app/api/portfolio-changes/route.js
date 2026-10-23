import { prisma } from '@/lib/prisma';
import { withErrorHandler, flattenTrade } from '@/lib/apiHelpers';
import { requireOwnedPortfolio } from '@/lib/auth';
import { tradeOrder } from '@/lib/ledger';
import { fetchMFHistoricalNAV, fetchStockMonthlyPrices } from '@/lib/historicalPrices';
import { buildPortfolioChanges, portfolioHistoryStart } from '@/lib/portfolioChanges';

export const dynamic = 'force-dynamic';

// Provider history only; never cache a user's trades or write valuations to the database.
const historyCache = new Map();
async function historyFor(instrument, from, asOf) {
  const key = JSON.stringify([instrument.id, instrument.symbol, instrument.exchange, instrument.isin, from, asOf]);
  const cached = historyCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = instrument.assetType === 'MF'
    ? instrument.isin ? await fetchMFHistoricalNAV(instrument.isin, from, { daily: true }) : {}
    : await fetchStockMonthlyPrices(instrument.symbol, instrument.exchange, from, { daily: true });
  if (Object.keys(value).length) {
    if (historyCache.size >= 300) historyCache.delete(historyCache.keys().next().value);
    historyCache.set(key, { value, expires: Date.now() + 15 * 60 * 1000 });
  }
  return value;
}

export const GET = withErrorHandler('GET /api/portfolio-changes', async (request, { session }) => {
  const portfolioId = new URL(request.url).searchParams.get('portfolioId');
  await requireOwnedPortfolio(portfolioId, session);
  const loaded = await prisma.$transaction(async db => ({
    trades: await db.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder }),
    actions: await db.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] }),
  }));
  const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const trades = loaded.trades.map(flattenTrade);
  const from = portfolioHistoryStart(trades, asOf);
  const instruments = [...new Map(loaded.trades.map(t => [t.instrumentId, t.instrument])).values()];
  const histories = {}, prices = {}, meta = {};
  // Bound concurrency to avoid flooding price providers for large portfolios.
  for (let index = 0; index < instruments.length; index += 5) {
    await Promise.all(instruments.slice(index, index + 5).map(async instrument => {
      try { histories[instrument.id] = await historyFor(instrument, from, asOf); }
      catch { histories[instrument.id] = {}; }
      prices[instrument.id] = instrument.price == null ? null : Number(instrument.price);
      meta[instrument.id] = { asOf: instrument.priceAsOf?.toISOString().slice(0, 10) };
    }));
  }
  return Response.json(buildPortfolioChanges({ trades, corporateActions: loaded.actions, histories, prices, meta, asOf }));
});
