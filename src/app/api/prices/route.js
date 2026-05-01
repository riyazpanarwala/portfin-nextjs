import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();
const PRICE_STALE_MS = 6 * 60 * 60 * 1000;

function yahooSymbol(symbol, exchange) {
  return exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
}

function isFresh(updatedAt) {
  return updatedAt && Date.now() - new Date(updatedAt).getTime() < PRICE_STALE_MS;
}

async function saveInstrumentPrice(inst, price) {
  await prisma.instrument.update({
    where: { id: inst.id },
    data: { price, priceUpdatedAt: new Date() },
  }).catch(() => {});
}

/**
 * POST /api/prices   { symbols: string[], force?: boolean, cacheOnly?: boolean }
 * 1. For STOCK/ETF instruments: refresh from Yahoo Finance when stale
 * 2. For MF instruments: search AMFI NAVAll.txt
 * 3. Fallback: last recorded trade price from DB
 */
export async function POST(request) {
  try {
    const { symbols, force = false, cacheOnly = false } = await request.json();
    if (!Array.isArray(symbols) || !symbols.length) return NextResponse.json({ prices: {} });

    const prices = {};
    const meta = {};

    // Load all instruments for these symbols
    const instruments = await prisma.instrument.findMany({
      where: { symbol: { in: symbols.map(s => s.toUpperCase()) } },
    });

    // Separate MF vs stock
    const mfInstrs = instruments.filter(i => i.assetType === 'MF');
    const stockInstrs = instruments.filter(i => i.assetType === 'STOCK');

    // For stocks/ETFs: refresh stale prices from Yahoo Finance, otherwise use cache
    for (const inst of stockInstrs) {
      const cachedPrice = inst.price ? parseFloat(inst.price) : null;
      if (cacheOnly && cachedPrice) {
        prices[inst.symbol] = cachedPrice;
        meta[inst.symbol] = { source: 'cache', updatedAt: inst.priceUpdatedAt };
        continue;
      }

      if (!force && cachedPrice && isFresh(inst.priceUpdatedAt)) {
        prices[inst.symbol] = cachedPrice;
        meta[inst.symbol] = { source: 'cache', updatedAt: inst.priceUpdatedAt };
        continue;
      }

      try {
        const quote = await yahooFinance.quote(yahooSymbol(inst.symbol, inst.exchange), {}, { timeout: 10000 });
        const livePrice = quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.previousClose ?? null;
        if (livePrice && livePrice > 0) {
          prices[inst.symbol] = livePrice;
          meta[inst.symbol] = { source: 'yahoo', updatedAt: new Date().toISOString() };
          await saveInstrumentPrice(inst, livePrice);
          continue;
        }
      } catch (e) {
        console.warn(`Yahoo fetch failed for ${inst.symbol}:`, e.message);
      }

      if (cachedPrice) {
        prices[inst.symbol] = cachedPrice;
        meta[inst.symbol] = { source: 'cache-fallback', updatedAt: inst.priceUpdatedAt };
      }
    }

    // For MFs: use cached NAV on page load; fetch live NAV only on explicit refresh
    if (cacheOnly) {
      for (const inst of mfInstrs) {
        if (inst.price) {
          prices[inst.symbol] = parseFloat(inst.price);
          meta[inst.symbol] = { source: 'cache', updatedAt: inst.priceUpdatedAt };
        }
      }
    } else if (mfInstrs.length > 0) {
      try {
        const res = await fetch('https://portal.amfiindia.com/spages/NAVAll.txt', {
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        });
        if (res.ok) {
          const text = await res.text();
          // Build a map of schemeName.lower -> nav
          const navMap = new Map();
          for (const line of text.split('\n')) {
            const p = line.split(';');
            if (p.length < 5) continue;
            const schemeName = p[3].trim().toLowerCase();
            const nav = parseFloat(p[4]);
            if (schemeName && !isNaN(nav) && nav > 0) navMap.set(schemeName, nav);
          }

          for (const inst of mfInstrs) {
            const key = inst.name.toLowerCase();
            let nav = navMap.get(key);
            if (!nav) {
              // Fuzzy: match on most words
              const words = key.split(' ').filter(w => w.length > 3);
              let best = null, bestScore = 0;
              for (const [k, v] of navMap) {
                const score = words.filter(w => k.includes(w)).length;
                if (score > bestScore) { bestScore = score; best = v; }
              }
              if (bestScore >= 3) nav = best;
            }
            if (nav) {
              prices[inst.symbol] = nav;
              meta[inst.symbol] = { source: 'amfi', updatedAt: new Date().toISOString() };
              await saveInstrumentPrice(inst, nav);
            }
          }
        }
      } catch (e) {
        console.warn('AMFI fetch failed:', e.message);
      }
    }

    // Fallback: last trade price for anything still missing
    const missing = symbols.filter(s => !prices[s.toUpperCase()] && !prices[s]);
    for (const sym of missing) {
      const lastTrade = await prisma.trade.findFirst({
        where: { instrument: { symbol: sym.toUpperCase() } },
        orderBy: { tradeDate: 'desc' },
        select: { price: true },
      });
      if (lastTrade) {
        prices[sym] = parseFloat(lastTrade.price);
        meta[sym] = { source: 'last-trade', updatedAt: null };
      }
    }

    return NextResponse.json({ prices, meta });
  } catch (e) {
    console.error('POST /api/prices:', e);
    return NextResponse.json({ prices: {} });
  }
}

/**
 * PATCH /api/prices  { symbol, price }  — manual CMP override
 */
export async function PATCH(request) {
  try {
    const { symbol, price } = await request.json();
    if (!symbol || price == null) return NextResponse.json({ error: 'symbol and price required' }, { status: 400 });

    const updated = await prisma.instrument.updateMany({
      where: { symbol: symbol.toUpperCase() },
      data: { price: parseFloat(price), priceUpdatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      updated: updated.count,
      meta: { [symbol.toUpperCase()]: { source: 'manual', updatedAt: new Date().toISOString() } },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
