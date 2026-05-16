import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHelpers';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance({
  suppressNotices: ['ripHistorical', 'yahooSurvey'],
});
const MARKET_SYMBOL = '^NSEI';
const BETA_LOOKBACK_DAYS = 365 * 3;
const BETA_INTERVAL = '1wk';
const MIN_ALIGNED_RETURNS = 52;
const BETA_CONCURRENCY = 6;

function yahooSymbol(symbol, exchange) {
  return exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
}

function asFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function toReturnMap(history) {
  const rows = history
    .map(row => ({
      date: toDateKey(row.date),
      close: asFiniteNumber(row.adjClose) ?? asFiniteNumber(row.adjclose) ?? asFiniteNumber(row.close),
    }))
    .filter(row => row.date && row.close != null && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const returns = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    const curr = rows[i].close;
    if (prev > 0 && curr > 0) returns.set(rows[i].date, curr / prev - 1);
  }
  return returns;
}

async function fetchReturnMap(symbol) {
  const period1 = new Date();
  period1.setDate(period1.getDate() - BETA_LOOKBACK_DAYS);

  const history = await yahooFinance.chart(
    symbol,
    {
      period1: period1.toISOString().slice(0, 10),
      period2: new Date().toISOString().slice(0, 10),
      interval: BETA_INTERVAL,
      return: 'array',
    },
    { timeout: 15000 },
  );

  return toReturnMap(history.quotes ?? []);
}

function calculateBeta(stockReturns, marketReturns) {
  const pairs = [];
  for (const [date, stockReturn] of stockReturns.entries()) {
    const marketReturn = marketReturns.get(date);
    if (marketReturn != null) pairs.push([stockReturn, marketReturn]);
  }

  if (pairs.length < MIN_ALIGNED_RETURNS) return null;

  const avgStock = pairs.reduce((sum, [stockReturn]) => sum + stockReturn, 0) / pairs.length;
  const avgMarket = pairs.reduce((sum, [, marketReturn]) => sum + marketReturn, 0) / pairs.length;

  let covariance = 0;
  let marketVariance = 0;
  for (const [stockReturn, marketReturn] of pairs) {
    covariance += (stockReturn - avgStock) * (marketReturn - avgMarket);
    marketVariance += Math.pow(marketReturn - avgMarket, 2);
  }

  if (marketVariance <= 0) return null;
  return covariance / marketVariance;
}

async function fetchCalculatedBeta(inst, marketReturns) {
  const yfSymbol = yahooSymbol(inst.symbol, inst.exchange);
  try {
    const stockReturns = await fetchReturnMap(yfSymbol);
    const beta = calculateBeta(stockReturns, marketReturns);
    if (beta != null) {
      return {
        beta,
        source: 'calculated-3y-weekly-nifty50',
        yahooSymbol: yfSymbol,
        observations: [...stockReturns.keys()].filter(date => marketReturns.has(date)).length,
      };
    }
  } catch (e) {
    console.warn(`[portfolio-beta] chart beta failed for ${yfSymbol}:`, e.message);
  }

  return { beta: null, source: 'unavailable', yahooSymbol: yfSymbol };
}

async function fetchYahooPublishedBeta(inst) {
  const yfSymbol = yahooSymbol(inst.symbol, inst.exchange);

  try {
    const quote = await yahooFinance.quote(yfSymbol, {}, { timeout: 10000 });
    const quoteBeta = asFiniteNumber(quote?.beta);
    if (quoteBeta != null) {
      return { beta: quoteBeta, source: 'yahoo-quote', yahooSymbol: yfSymbol };
    }
  } catch (e) {
    console.warn(`[portfolio-beta] quote failed for ${yfSymbol}:`, e.message);
  }

  try {
    const summary = await yahooFinance.quoteSummary(
      yfSymbol,
      { modules: ['defaultKeyStatistics', 'summaryDetail'] },
      { timeout: 10000 },
    );
    const beta =
      asFiniteNumber(summary?.defaultKeyStatistics?.beta) ??
      asFiniteNumber(summary?.summaryDetail?.beta);

    if (beta != null) {
      return { beta, source: 'yahoo-summary', yahooSymbol: yfSymbol };
    }
  } catch (e) {
    console.warn(`[portfolio-beta] summary failed for ${yfSymbol}:`, e.message);
  }

  return { beta: null, source: 'unavailable', yahooSymbol: yfSymbol };
}

async function fetchBeta(inst, marketReturns) {
  const calculated = await fetchCalculatedBeta(inst, marketReturns);
  if (calculated.beta != null) return calculated;
  return fetchYahooPublishedBeta(inst);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export const POST = withErrorHandler('POST /api/portfolio-beta', async (request) => {
  const { holdings = [] } = await request.json();
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return NextResponse.json({
      beta: null,
      coveragePct: 0,
      coveredValue: 0,
      totalValue: 0,
      rows: [],
      missing: [],
    });
  }

  const active = holdings
    .map(h => ({
      symbol: String(h.symbol || '').toUpperCase(),
      assetType: h.assetType,
      marketValue: asFiniteNumber(h.marketValue) || 0,
    }))
    .filter(h => h.symbol && h.marketValue > 0);

  const totalValue = active.reduce((sum, h) => sum + h.marketValue, 0);
  const stockHoldings = active.filter(h => h.assetType === 'STOCK');

  const instruments = await prisma.instrument.findMany({
    where: {
      symbol: { in: stockHoldings.map(h => h.symbol) },
      assetType: 'STOCK',
    },
    select: { symbol: true, exchange: true, isin: true },
  });

  const instBySymbol = new Map(instruments.map(inst => [inst.symbol, inst]));
  const rows = [];
  const missing = [];
  const betaCandidates = [];
  let marketReturns = new Map();

  for (const holding of stockHoldings) {
    const inst = instBySymbol.get(holding.symbol);
    if (!inst) {
      missing.push({ symbol: holding.symbol, reason: 'instrument-not-found' });
    } else if (!inst.isin) {
      missing.push({ symbol: holding.symbol, reason: 'missing-isin-skipped' });
    } else {
      betaCandidates.push({ holding, inst });
    }
  }

  if (betaCandidates.length > 0) {
    try {
      marketReturns = await fetchReturnMap(MARKET_SYMBOL);
    } catch (e) {
      console.warn(`[portfolio-beta] market history failed for ${MARKET_SYMBOL}:`, e.message);
    }
  }

  const betaRows = await mapWithConcurrency(betaCandidates, BETA_CONCURRENCY, async ({ holding, inst }) => {
    const betaInfo = await fetchBeta(inst, marketReturns);
    if (betaInfo.beta == null) {
      return { missing: { symbol: holding.symbol, reason: 'beta-unavailable' } };
    }

    return {
      symbol: holding.symbol,
      marketValue: holding.marketValue,
      beta: betaInfo.beta,
      source: betaInfo.source,
      yahooSymbol: betaInfo.yahooSymbol,
      observations: betaInfo.observations ?? null,
    };
  });

  for (const row of betaRows) {
    if (row?.missing) missing.push(row.missing);
    else if (row) rows.push(row);
  }

  const coveredValue = rows.reduce((sum, row) => sum + row.marketValue, 0);
  const weightedBeta = coveredValue > 0
    ? rows.reduce((sum, row) => sum + row.beta * (row.marketValue / coveredValue), 0)
    : null;

  return NextResponse.json({
    beta: weightedBeta,
    coveragePct: totalValue > 0 ? (coveredValue / totalValue) * 100 : 0,
    coveredValue,
    totalValue,
    rows,
    missing,
  });
});
