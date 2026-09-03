import { NextResponse } from 'next/server';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance({
  suppressNotices: ['ripHistorical', 'yahooSurvey'],
});

// In-memory cache with 1-hour TTL
const memoryCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function yahooSymbol(symbol, exchange) {
  return exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
}

function getMarketCapClass(marketCapInINR) {
  if (!marketCapInINR || marketCapInINR <= 0) return 'UNKNOWN';
  const cr = marketCapInINR / 10_000_000; // Convert to Crores
  if (cr >= 20000) return 'LARGE';
  if (cr >= 5000) return 'MID';
  return 'SMALL';
}

/**
 * POST /api/fundamentals
 * Request Body:
 * {
 *   holdings: Array<{ symbol: string, exchange?: string, marketValue?: number }>,
 *   force?: boolean
 * }
 */
export const POST = withErrorHandler(
  'POST /api/fundamentals',
  async (request) => {
    const { holdings = [], force = false } = await request.json();

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json({
        fundamentals: {},
        summary: {
          weightedPE: null,
          weightedPB: null,
          marketCapBreakdown: { large: 0, mid: 0, small: 0, unknown: 0 },
          niftyPE: 23.5,
        },
      });
    }

    const fundamentals = {};
    const now = Date.now();

    await Promise.all(
      holdings.map(async (item) => {
        const symbol = (item.symbol || '').toUpperCase();
        if (!symbol) return;

        const exchange = item.exchange || 'NSE';
        const cacheKey = `${symbol}:${exchange}`;

        const cached = memoryCache.get(cacheKey);
        if (!force && cached && now - cached.timestamp < CACHE_TTL_MS) {
          fundamentals[symbol] = cached.data;
          return;
        }

        try {
          const ySym = yahooSymbol(symbol, exchange);
          const res = await yahooFinance.quoteSummary(ySym, {
            modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price'],
          }, { timeout: 8000 });

          const summaryDetail = res?.summaryDetail || {};
          const keyStats = res?.defaultKeyStatistics || {};
          const finData = res?.financialData || {};
          const priceObj = res?.price || {};

          const pe = summaryDetail.trailingPE ?? summaryDetail.forwardPE ?? null;
          const forwardPE = summaryDetail.forwardPE ?? null;
          const pb = keyStats.priceToBook ?? null;
          const roe = finData.returnOnEquity ? finData.returnOnEquity * 100 : null;
          const debtToEquity = finData.debtToEquity ? finData.debtToEquity / 100 : null;
          const marketCap = summaryDetail.marketCap ?? null;
          const marketCapClass = getMarketCapClass(marketCap);

          const flags = [];
          if (pe && pe > 60) flags.push({ type: 'HIGH_VALUATION', label: 'High Valuation (P/E > 60)' });
          if (debtToEquity && debtToEquity > 1.5) flags.push({ type: 'HIGH_LEVERAGE', label: 'High Leverage (D/E > 1.5)' });
          if (roe !== null && roe < 8) flags.push({ type: 'LOW_PROFITABILITY', label: 'Low Profitability (ROE < 8%)' });

          const itemData = {
            symbol,
            exchange,
            companyName: priceObj.longName || priceObj.shortName || symbol,
            pe: pe ? parseFloat(pe.toFixed(2)) : null,
            forwardPE: forwardPE ? parseFloat(forwardPE.toFixed(2)) : null,
            pb: pb ? parseFloat(pb.toFixed(2)) : null,
            roe: roe ? parseFloat(roe.toFixed(2)) : null,
            debtToEquity: debtToEquity ? parseFloat(debtToEquity.toFixed(2)) : null,
            marketCap,
            marketCapCr: marketCap ? parseFloat((marketCap / 10_000_000).toFixed(2)) : null,
            marketCapClass,
            flags,
            updatedAt: new Date().toISOString(),
          };

          memoryCache.set(cacheKey, { data: itemData, timestamp: now });
          fundamentals[symbol] = itemData;
        } catch (err) {
          console.warn(`[fundamentals] Failed to fetch fundamentals for ${symbol}:`, err.message);
          fundamentals[symbol] = null;
        }
      })
    );

    // Compute portfolio-weighted fundamental aggregates
    let totalValueWithPE = 0;
    let weightedPESum = 0;

    let totalValueWithPB = 0;
    let weightedPBSum = 0;

    let totalVal = 0;
    const capValue = { LARGE: 0, MID: 0, SMALL: 0, UNKNOWN: 0 };

    for (const item of holdings) {
      const sym = (item.symbol || '').toUpperCase();
      const val = parseFloat(item.marketValue || 0);
      totalVal += val;

      const fData = fundamentals[sym];
      if (!fData) {
        capValue.UNKNOWN += val;
        continue;
      }

      if (fData.pe && val > 0) {
        weightedPESum += fData.pe * val;
        totalValueWithPE += val;
      }

      if (fData.pb && val > 0) {
        weightedPBSum += fData.pb * val;
        totalValueWithPB += val;
      }

      const capClass = fData.marketCapClass || 'UNKNOWN';
      capValue[capClass] = (capValue[capClass] || 0) + val;
    }

    const summary = {
      weightedPE: totalValueWithPE > 0 ? parseFloat((weightedPESum / totalValueWithPE).toFixed(2)) : null,
      weightedPB: totalValueWithPB > 0 ? parseFloat((weightedPBSum / totalValueWithPB).toFixed(2)) : null,
      marketCapBreakdown: totalVal > 0 ? {
        large: parseFloat(((capValue.LARGE / totalVal) * 100).toFixed(1)),
        mid: parseFloat(((capValue.MID / totalVal) * 100).toFixed(1)),
        small: parseFloat(((capValue.SMALL / totalVal) * 100).toFixed(1)),
        unknown: parseFloat(((capValue.UNKNOWN / totalVal) * 100).toFixed(1)),
      } : { large: 0, mid: 0, small: 0, unknown: 0 },
      niftyPE: 23.5,
    };

    return NextResponse.json({ fundamentals, summary });
  }
);
