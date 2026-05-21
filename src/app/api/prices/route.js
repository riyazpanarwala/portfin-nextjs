import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance({
  suppressNotices: ['ripHistorical', 'yahooSurvey'],
});

const PRICE_STALE_MS = 6 * 60 * 60 * 1000;

function yahooSymbol(symbol, exchange) {
  return exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
}

function isFresh(updatedAt) {
  return (
    updatedAt &&
    Date.now() - new Date(updatedAt).getTime() < PRICE_STALE_MS
  );
}

async function saveInstrumentPrice(inst, price) {
  await prisma.instrument
    .update({
      where: { id: inst.id },
      data: {
        price,
        priceUpdatedAt: new Date(),
      },
    })
    .catch(() => { });
}

function normalizeSchemeName(name = '') {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/direct plan/g, '')
    .replace(/regular plan/g, '')
    .replace(/growth option/g, '')
    .replace(/idcw/g, '')
    .replace(/dividend/g, '')
    .replace(/bonus/g, '')
    .replace(/plan/g, '')
    .replace(/option/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * POST /api/prices
 * {
 *   symbols: string[],
 *   force?: boolean,
 *   cacheOnly?: boolean
 * }
 */
export const POST = withErrorHandler(
  'POST /api/prices',
  async (request) => {
    const {
      symbols,
      force = false,
      cacheOnly = false,
    } = await request.json();

    if (!Array.isArray(symbols) || !symbols.length) {
      return NextResponse.json({ prices: {} });
    }

    const prices = {};
    const meta = {};

    // Load all instruments
    const instruments = await prisma.instrument.findMany({
      where: {
        symbol: {
          in: symbols.map((s) => s.toUpperCase()),
        },
      },
    });

    const mfInstrs = instruments.filter(
      (i) => i.assetType === 'MF'
    );

    const stockInstrs = instruments.filter(
      (i) => i.assetType === 'STOCK'
    );

    // =========================================================
    // STOCKS / ETF
    // =========================================================

    for (const inst of stockInstrs) {
      const cachedPrice = inst.price
        ? parseFloat(inst.price)
        : null;

      if (cacheOnly && cachedPrice) {
        prices[inst.symbol] = cachedPrice;

        meta[inst.symbol] = {
          source: 'cache',
          updatedAt: inst.priceUpdatedAt,
        };

        continue;
      }

      if (!force && cachedPrice && isFresh(inst.priceUpdatedAt)) {
        prices[inst.symbol] = cachedPrice;

        meta[inst.symbol] = {
          source: 'cache',
          updatedAt: inst.priceUpdatedAt,
        };

        continue;
      }

      if (!inst.isin) {
        if (cachedPrice) {
          prices[inst.symbol] = cachedPrice;

          meta[inst.symbol] = {
            source: 'cache-missing-isin',
            updatedAt: inst.priceUpdatedAt,
          };
        } else {
          meta[inst.symbol] = {
            source: 'missing-isin-skipped',
            updatedAt: null,
          };
        }

        continue;
      }

      try {
        const quote = await yahooFinance.quote(
          yahooSymbol(inst.symbol, inst.exchange),
          {},
          { timeout: 10000 }
        );

        const livePrice =
          quote?.regularMarketPrice ??
          quote?.postMarketPrice ??
          quote?.previousClose ??
          null;

        if (livePrice && livePrice > 0) {
          prices[inst.symbol] = livePrice;

          meta[inst.symbol] = {
            source: 'yahoo',
            updatedAt: new Date().toISOString(),
          };

          await saveInstrumentPrice(inst, livePrice);

          continue;
        }
      } catch (e) {
        console.warn(
          `Yahoo fetch failed for ${inst.symbol}:`,
          e.message
        );
      }

      // fallback to cache
      if (cachedPrice) {
        prices[inst.symbol] = cachedPrice;

        meta[inst.symbol] = {
          source: 'cache-fallback',
          updatedAt: inst.priceUpdatedAt,
        };
      }
    }

    // =========================================================
    // MUTUAL FUNDS (AMFI)
    // =========================================================

    if (cacheOnly) {
      for (const inst of mfInstrs) {
        if (inst.price) {
          prices[inst.symbol] = parseFloat(inst.price);

          meta[inst.symbol] = {
            source: 'cache',
            updatedAt: inst.priceUpdatedAt,
          };
        }
      }
    } else if (mfInstrs.length > 0) {
      try {
        const res = await fetch(
          'https://portal.amfiindia.com/spages/NAVAll.txt',
          {
            signal: AbortSignal.timeout(15000),
            cache: 'no-store',
          }
        );

        if (res.ok) {
          const text = await res.text();

          /**
           * Maps:
           * ISIN -> NAV
           * Scheme Name -> NAV
           */
          const navMap = new Map();

          for (const line of text.split(/\r?\n/)) {
            const p = line.split(';');

            if (p.length < 5) continue;

            /**
             * NAVAll format:
             * 0 = Scheme Code
             * 1 = ISIN Growth
             * 2 = ISIN Reinvestment
             * 3 = Scheme Name
             * 4 = NAV
             */

            const isinGrowth = p[1]?.trim();
            const isinReinv = p[2]?.trim();

            const schemeName = p[3]?.trim();

            const nav = parseFloat(
              p[4]?.replace(/,/g, '').trim()
            );

            if (isNaN(nav) || nav <= 0) continue;

            // BEST MATCH => ISIN
            if (isinGrowth) {
              navMap.set(isinGrowth, nav);
            }

            if (isinReinv) {
              navMap.set(isinReinv, nav);
            }

            // FALLBACK => normalized scheme name
            if (schemeName) {
              navMap.set(
                normalizeSchemeName(schemeName),
                nav
              );
            }
          }

          // Match NAVs
          for (const inst of mfInstrs) {
            let nav = null;

            // =================================================
            // 1. BEST MATCH => ISIN
            // =================================================

            if (inst.isin) {
              nav = navMap.get(inst.isin.trim());
            }

            // =================================================
            // 2. Exact normalized name match
            // =================================================

            if (!nav && inst.name) {
              const normalizedName = normalizeSchemeName(
                inst.name
              );

              nav = navMap.get(normalizedName);
            }

            // =================================================
            // 3. Fuzzy match fallback
            // =================================================

            if (!nav && inst.name) {
              const normalizedName = normalizeSchemeName(
                inst.name
              );

              const words = normalizedName
                .split(' ')
                .filter(
                  (w) =>
                    w.length > 3 &&
                    ![
                      'fund',
                      'plan',
                      'growth',
                      'direct',
                      'regular',
                    ].includes(w)
                );

              let bestScore = 0;
              let bestNav = null;

              for (const [key, value] of navMap.entries()) {
                if (typeof key !== 'string') continue;

                const score = words.filter((w) =>
                  key.includes(w)
                ).length;

                if (score > bestScore) {
                  bestScore = score;
                  bestNav = value;
                }
              }

              if (bestScore >= 2) {
                nav = bestNav;
              }
            }

            // =================================================
            // SAVE NAV
            // =================================================

            if (nav) {
              prices[inst.symbol] = nav;

              meta[inst.symbol] = {
                source: 'amfi',
                updatedAt: new Date().toISOString(),
              };

              await saveInstrumentPrice(inst, nav);
            }
          }
        }
      } catch (e) {
        console.warn('AMFI fetch failed:', e.message);
      }
    }

    // =========================================================
    // FALLBACK => LAST TRADE PRICE
    // =========================================================

    const missing = symbols.filter(
      (s) => !prices[s.toUpperCase()] && !prices[s]
    );

    for (const sym of missing) {
      const lastTrade = await prisma.trade.findFirst({
        where: {
          instrument: {
            symbol: sym.toUpperCase(),
          },
        },
        orderBy: {
          tradeDate: 'desc',
        },
        select: {
          price: true,
        },
      });

      if (lastTrade) {
        prices[sym] = parseFloat(lastTrade.price);

        meta[sym] = {
          source: 'last-trade',
          updatedAt: null,
        };
      }
    }

    return NextResponse.json({
      prices,
      meta,
    });
  }
);

/**
 * PATCH /api/prices
 * {
 *   symbol,
 *   price
 * }
 */
export const PATCH = withErrorHandler(
  'PATCH /api/prices',
  async (request) => {
    const { symbol, price } = await request.json();

    if (!symbol || price == null) {
      return badRequest('symbol and price required');
    }

    const updated = await prisma.instrument.updateMany({
      where: {
        symbol: symbol.toUpperCase(),
      },
      data: {
        price: parseFloat(price),
        priceUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updated: updated.count,
      meta: {
        [symbol.toUpperCase()]: {
          source: 'manual',
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }
);