import { prisma } from './prisma.js';
import { resolveAnalyticsHoldings } from './analyticsHoldings.js';
import YahooFinance from 'yahoo-finance2';

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
  if (value == null) return null;
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

async function fetchReturnMap(symbol, yahooClient) {
  const period1 = new Date();
  period1.setDate(period1.getDate() - BETA_LOOKBACK_DAYS);

  const history = await yahooClient.chart(
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

async function fetchCalculatedBeta(inst, marketReturns, yahooClient) {
  const yfSymbol = yahooSymbol(inst.symbol, inst.exchange);
  try {
    const stockReturns = await fetchReturnMap(yfSymbol, yahooClient);
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

async function fetchYahooPublishedBeta(inst, yahooClient) {
  const yfSymbol = yahooSymbol(inst.symbol, inst.exchange);

  try {
    const quote = await yahooClient.quote(yfSymbol, {}, { timeout: 10000 });
    const quoteBeta = asFiniteNumber(quote?.beta);
    if (quoteBeta != null) {
      return { beta: quoteBeta, source: 'yahoo-quote', yahooSymbol: yfSymbol };
    }
  } catch (e) {
    console.warn(`[portfolio-beta] quote failed for ${yfSymbol}:`, e.message);
  }

  try {
    const summary = await yahooClient.quoteSummary(
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

async function fetchBeta(inst, marketReturns, yahooClient) {
  const calculated = await fetchCalculatedBeta(inst, marketReturns, yahooClient);
  if (calculated.beta != null) return calculated;
  return fetchYahooPublishedBeta(inst, yahooClient);
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

export async function collectPortfolioBeta(holdings, { db = prisma, yahooClient = yahooFinance } = {}) {
  const active = (await resolveAnalyticsHoldings(holdings, db)).filter(h => h.marketValue > 0);
  const totalValue = active.reduce((sum, h) => sum + h.marketValue, 0);
  const rows = [];
  const missing = [];
  const betaCandidates = [];
  let marketReturns = new Map();

  for (const holding of active) {
    const inst = holding.instrument;
    if (inst && inst.assetType !== 'STOCK') continue;
    const identity = { instrumentId: holding.instrumentId, symbol: inst?.symbol || null, exchange: inst?.exchange || null };
    if (!inst) {
      missing.push({ ...identity, reason: 'instrument-not-found' });
    } else if (!inst.isin) {
      missing.push({ ...identity, reason: 'missing-isin-skipped' });
    } else {
      betaCandidates.push({ holding, inst });
    }
  }

  if (betaCandidates.length > 0) {
    try {
      marketReturns = await fetchReturnMap(MARKET_SYMBOL, yahooClient);
    } catch (e) {
      console.warn(`[portfolio-beta] market history failed for ${MARKET_SYMBOL}:`, e.message);
    }
  }

  const betaRows = await mapWithConcurrency(betaCandidates, BETA_CONCURRENCY, async ({ holding, inst }) => {
    const betaInfo = await fetchBeta(inst, marketReturns, yahooClient);
    if (betaInfo.beta == null) {
      return { missing: { instrumentId: holding.instrumentId, symbol: inst.symbol, exchange: inst.exchange, reason: 'beta-unavailable' } };
    }

    return {
      instrumentId: holding.instrumentId,
      symbol: inst.symbol,
      exchange: inst.exchange,
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

  return {
    beta: weightedBeta,
    coveragePct: totalValue > 0 ? (coveredValue / totalValue) * 100 : 0,
    coveredValue,
    totalValue,
    rows,
    missing,
  };
}
