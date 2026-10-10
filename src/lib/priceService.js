import YahooFinance from 'yahoo-finance2';
import { prisma } from './prisma.js';
import { parseAmfiNav } from './amfiNav.js';
import { dayKey } from './financialRules.js';

const yahoo = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });
const SIX_HOURS = 6 * 60 * 60 * 1000;

export async function collectInstrumentPrices(instruments, { force = false, cacheOnly = false } = {}) {
  const prices = {};
  const meta = {};
  let navMap;
  if (!cacheOnly && instruments.some(i => i.assetType === 'MF')) {
    try {
      const response = await fetch('https://portal.amfiindia.com/spages/NAVAll.txt', { signal: AbortSignal.timeout(15000), cache: 'no-store' });
      if (!response.ok) throw new Error('AMFI unavailable');
      navMap = parseAmfiNav(await response.text());
    } catch (err) { console.warn('[prices] AMFI:', err.message); }
  }
  for (const instrument of instruments) {
    let price = Number(instrument.price);
    let asOf = instrument.priceAsOf ? dayKey(instrument.priceAsOf) : null;
    let source = 'cache';
    let updatedAt = instrument.priceUpdatedAt;
    const fresh = updatedAt && Date.now() - new Date(updatedAt).getTime() < SIX_HOURS;
    let live;
    if (!cacheOnly && (force || !fresh || !asOf)) {
      if (instrument.assetType === 'MF') live = navMap?.get(instrument.isin?.trim().toUpperCase());
      else {
        try {
          const quote = await yahoo.quote(`${instrument.symbol}.${instrument.exchange === 'BSE' ? 'BO' : 'NS'}`, {}, { timeout: 10000 });
          const date = quote.regularMarketTime;
          if (Number.isFinite(quote.regularMarketPrice) && quote.regularMarketPrice > 0 && date) live = { price: quote.regularMarketPrice, asOf: dayKey(new Date(date)) };
        } catch (err) { console.warn(`[prices] ${instrument.symbol}:`, err.message); }
      }
    }
    if (live && live.asOf <= dayKey(new Date()) && (!asOf || live.asOf >= asOf)) {
      price = live.price; asOf = live.asOf; source = instrument.assetType === 'MF' ? 'amfi' : 'yahoo'; updatedAt = new Date();
      // A failed persistence is surfaced, rather than reported as a successful cache update.
      await prisma.instrument.update({ where: { id: instrument.id }, data: { price, priceAsOf: new Date(asOf), priceUpdatedAt: updatedAt, priceSource: source } });
    }
    const valid = Number.isFinite(price) && price > 0;
    const record = { source: valid ? source : 'unavailable', providerSource: source === 'cache' ? instrument.priceSource || 'unknown' : source, updatedAt, asOf, stale: !asOf || Date.now() - Date.parse(asOf) > 7 * 86400000 };
    meta[instrument.id] = record;
    if (valid) prices[instrument.id] = price;
    // Compatibility for views that still look prices up by symbol, only when unambiguous.
    if (instruments.filter(i => i.symbol === instrument.symbol).length === 1) {
      meta[instrument.symbol] = record;
      if (valid) prices[instrument.symbol] = price;
    }
  }
  return { prices, meta };
}
