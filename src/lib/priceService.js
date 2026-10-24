import YahooFinance from 'yahoo-finance2';
import { prisma } from './prisma.js';
import { parseAmfiNav } from './amfiNav.js';
import { dayKey } from './financialRules.js';
import { isDelistedStock } from './marketDataPolicy.js';
import { persistInstrumentPrices } from './pricePersistence.js';

const yahoo = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });
const SIX_HOURS = 6 * 60 * 60 * 1000;

export async function collectInstrumentPrices(instruments, { force = false, cacheOnly = false } = {}, { db = prisma, yahooClient = yahoo, fetcher = fetch, persistPrices = persistInstrumentPrices } = {}) {
  const prices = {};
  const meta = {};
  const updates = [];
  let navMap;
  const needsRefresh = instrument => !cacheOnly && !isDelistedStock(instrument) && (force ||
    !instrument.priceAsOf || !instrument.priceUpdatedAt ||
    Date.now() - new Date(instrument.priceUpdatedAt).getTime() >= SIX_HOURS ||
    !Number.isFinite(Number(instrument.price)) || Number(instrument.price) <= 0);
  const quoteSymbol = instrument => `${instrument.symbol}.${instrument.exchange === 'BSE' ? 'BO' : 'NS'}`.toUpperCase();
  const stockSymbols = [...new Set(instruments.filter(i => i.assetType === 'STOCK' && needsRefresh(i)).map(quoteSymbol))];
  const quotesBySymbol = new Map();
  await Promise.all([
    (async () => {
      if (!instruments.some(i => i.assetType === 'MF' && needsRefresh(i))) return;
      try {
        const response = await fetcher('https://portal.amfiindia.com/spages/NAVAll.txt', { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        if (!response.ok) throw new Error('AMFI unavailable');
        navMap = parseAmfiNav(await response.text());
      } catch (err) { console.warn('[prices] AMFI:', err.message); }
    })(),
    (async () => {
      if (!stockSymbols.length) return;
      try {
        const quotes = await yahooClient.quote(stockSymbols, {}, { timeout: 15000 });
        for (const quote of quotes) {
          const symbol = quote.symbol?.toUpperCase();
          const date = new Date(quote.regularMarketTime);
          if (stockSymbols.includes(symbol) && Number.isFinite(quote.regularMarketPrice) &&
              quote.regularMarketPrice > 0 && quote.regularMarketTime && Number.isFinite(date.getTime())) {
            quotesBySymbol.set(symbol, { price: quote.regularMarketPrice, asOf: dayKey(date) });
          }
        }
      } catch (err) { console.warn('[prices] Yahoo:', err.message); }
    })(),
  ]);
  for (const instrument of instruments) {
    let price = Number(instrument.price);
    let asOf = instrument.priceAsOf ? dayKey(instrument.priceAsOf) : null;
    let source = 'cache';
    let updatedAt = instrument.priceUpdatedAt;
    let live;
    if (needsRefresh(instrument)) {
      if (instrument.assetType === 'MF') live = navMap?.get(instrument.isin?.trim().toUpperCase());
      else live = quotesBySymbol.get(quoteSymbol(instrument));
    }
    if (live && live.asOf <= dayKey(new Date()) && (!asOf || live.asOf >= asOf)) {
      price = live.price; asOf = live.asOf; source = instrument.assetType === 'MF' ? 'amfi' : 'yahoo'; updatedAt = new Date();
      updates.push({ id: instrument.id, price, priceAsOf: new Date(asOf), priceUpdatedAt: updatedAt, priceSource: source });
    }
    const valid = Number.isFinite(price) && price > 0;
    const record = { source: valid ? source : 'unavailable', providerSource: source === 'cache' ? instrument.priceSource || 'unknown' : source, updatedAt, asOf, stale: !asOf || Date.now() - Date.parse(asOf) > 7 * 86400000 };
    if (isDelistedStock(instrument)) record.refreshSkipped = 'delisted';
    meta[instrument.id] = record;
    if (valid) prices[instrument.id] = price;
    // Compatibility for views that still look prices up by symbol, only when unambiguous.
    if (instruments.filter(i => i.symbol === instrument.symbol).length === 1) {
      meta[instrument.symbol] = record;
      if (valid) prices[instrument.symbol] = price;
    }
  }
  // Persist the whole refresh before reporting live prices as successful.
  if (updates.length) await persistPrices(db, updates);
  return { prices, meta };
}
