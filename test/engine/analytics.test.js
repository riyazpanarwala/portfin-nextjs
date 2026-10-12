import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFundamentals } from '../../src/lib/fundamentalsService.js';
import { collectPortfolioBeta } from '../../src/lib/portfolioBetaService.js';
import { readAnalyticsRequest, resolveAnalyticsHoldings } from '../../src/lib/analyticsHoldings.js';
import { withErrorHandler } from '../../src/lib/apiHelpers.js';
import { analyticsRequestKey, portfolioBetaCacheSignature, startFundamentalsRequest, EMPTY_FUNDAMENTALS } from '../../src/lib/analyticsClient.js';

const instrument = (id, symbol, exchange = 'NSE', extra = {}) => ({ id, symbol, exchange, name: symbol, sector: 'Example', assetType: 'STOCK', isin: `TEST-${id}`, price: 100, ...extra });
const holdings = [{ instrumentId: 'nse', marketValue: 100 }, { instrumentId: 'bse', marketValue: 300 }];

const analyticsRequest = body => new Request('http://localhost/api/fundamentals', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
});

test('analytics request parser rejects malformed JSON and non-object bodies with HTTP 400', async () => {
  for (const body of ['', '{', 'null', '[]', '"text"', 'false', '42']) {
    await assert.rejects(readAnalyticsRequest(analyticsRequest(body)), { status: 400, message: 'Invalid request body.' });
  }
});

test('analytics request parser accepts defaults and boolean refresh flags without coercion', async () => {
  assert.deepEqual(await readAnalyticsRequest(analyticsRequest('{}')), { holdings: [], force: false });
  for (const force of [false, true]) {
    assert.deepEqual(await readAnalyticsRequest(analyticsRequest(JSON.stringify({ holdings, force }))), { holdings, force });
  }
  for (const force of ['false', 'true', 0, 1, null, [], {}]) {
    await assert.rejects(readAnalyticsRequest(analyticsRequest(JSON.stringify({ force }))), { status: 400, message: 'force must be a boolean.' });
  }
});

test('analytics validation errors return HTTP 400 through the authenticated API wrapper before collection', async t => {
  t.mock.method(console, 'error', () => {});
  let collections = 0;
  const handler = withErrorHandler('POST analytics', async request => {
    const body = await readAnalyticsRequest(request);
    collections++;
    return Response.json(body);
  }, { authenticate: async () => ({ userId: 'test-user' }) });
  for (const body of ['{', 'null', '[]', '{"force":"false"}']) {
    const response = await handler(analyticsRequest(body));
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(collections, 0);
  const response = await handler(analyticsRequest(JSON.stringify({ holdings, force: true })));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { holdings, force: true });
  assert.equal(collections, 1);
});

function catalogue(rows) {
  const queries = [];
  return { queries, instrument: { findMany: async query => {
    queries.push(query);
    return rows.filter(row => query.where.id.in.includes(row.id)).reverse();
  } } };
}
function summary(pe, cap, quoteType = 'EQUITY', name = 'Example') {
  return { summaryDetail: { trailingPE: pe, marketCap: cap }, defaultKeyStatistics: { priceToBook: pe / 10 },
    financialData: { returnOnEquity: 0.1 }, price: { longName: name, regularMarketPrice: 100 }, quoteType: { quoteType } };
}

test('fundamentals use canonical instrument IDs and exchanges despite forged symbol fields or reversed DB order', async () => {
  const db = catalogue([instrument('nse', 'DUP'), instrument('bse', 'DUP', 'BSE')]);
  const calls = [];
  const yahooClient = { quoteSummary: async symbol => { calls.push(symbol); return summary(symbol === 'DUP.NS' ? 10 : 30, 2e11); } };
  const result = await collectFundamentals(holdings.map(h => ({ ...h, symbol: 'WRONG', exchange: 'OTHER' })), {}, { db, yahooClient, cache: new Map() });
  assert.deepEqual(calls.sort(), ['DUP.BO', 'DUP.NS']);
  assert.deepEqual(db.queries[0].where, { id: { in: ['nse', 'bse'] } });
  assert.deepEqual(Object.keys(result.fundamentals).sort(), ['bse', 'nse']);
  assert.equal(result.fundamentals.nse.exchange, 'NSE');
  assert.equal(result.fundamentals.bse.exchange, 'BSE');
  assert.equal(result.fundamentals.nse.pe, 10);
  assert.equal(result.fundamentals.bse.pe, 30);
  assert.equal(result.summary.weightedPE, 25);
  assert.equal(result.summary.weightedPB, 2.5);
});

test('fundamentals cache separates listings, recomputes changed weights, and honors force refresh', async () => {
  const db = catalogue([instrument('nse', 'DUP'), instrument('bse', 'DUP', 'BSE')]);
  const cache = new Map();
  let calls = 0, multiplier = 1;
  const yahooClient = { quoteSummary: async symbol => { calls++; return summary((symbol === 'DUP.NS' ? 10 : 30) * multiplier, 2e11); } };
  const deps = { db, yahooClient, cache };
  await collectFundamentals(holdings, {}, deps);
  assert.equal(cache.size, 2);
  const weighted = await collectFundamentals([{ instrumentId: 'nse', marketValue: 300 }, { instrumentId: 'bse', marketValue: 100 }], {}, deps);
  assert.equal(calls, 2);
  assert.equal(weighted.summary.weightedPE, 15);
  multiplier = 2;
  const refreshed = await collectFundamentals(holdings, { force: true }, deps);
  assert.equal(calls, 4);
  assert.equal(refreshed.summary.weightedPE, 50);
});

test('index and commodity ETFs both contribute to the ETF allocation bucket; missing metrics remain unknown', async () => {
  const rows = ['LARGE', 'MID', 'SMALL', 'INDEX', 'GOLD'].map(symbol => instrument(symbol, symbol));
  const values = [100, 100, 100, 200, 300, 200];
  const request = [...rows.map(row => row.id), 'missing'].map((instrumentId, index) => ({ instrumentId, marketValue: values[index] }));
  const yahooClient = { quoteSummary: async symbol => {
    const kind = symbol.startsWith('INDEX') || symbol.startsWith('GOLD') ? 'ETF' : 'EQUITY';
    const cap = symbol.startsWith('LARGE') ? 2e11 : symbol.startsWith('MID') ? 5e10 : 1e10;
    return summary(10, cap, kind, symbol.startsWith('GOLD') ? 'Gold ETF' : symbol);
  } };
  const result = await collectFundamentals(request, {}, { db: catalogue(rows), yahooClient, cache: new Map() });
  assert.equal(result.fundamentals.INDEX.marketCapClass, 'INDEX ETF');
  assert.equal(result.fundamentals.GOLD.marketCapClass, 'COMMODITY ETF');
  assert.equal(result.fundamentals.missing, null);
  assert.deepEqual(result.summary.marketCapBreakdown, { large: 10, mid: 10, small: 10, etf: 50, unknown: 20 });
});

test('one listing failure cannot borrow another exchange metrics or contaminate its cache', async () => {
  const db = catalogue([instrument('nse', 'DUP'), instrument('bse', 'DUP', 'BSE')]);
  const cache = new Map();
  const yahooClient = { quoteSummary: async symbol => { if (symbol === 'DUP.BO') throw new Error('Provider unavailable'); return summary(10, 2e11); } };
  const result = await collectFundamentals(holdings, {}, { db, yahooClient, cache });
  assert.equal(result.fundamentals.bse, null);
  assert.equal(result.fundamentals.nse.pe, 10);
  assert.equal(result.summary.weightedPE, 10);
  assert.equal(result.summary.marketCapBreakdown.unknown, 75);
  assert.equal(cache.size, 1);
});

function weeklyQuotes(scale) {
  let close = 100;
  return Array.from({ length: 65 }, (_, i) => {
    if (i) close *= 1 + scale * (0.005 + (i % 7 - 3) * 0.001);
    return { date: new Date(Date.UTC(2024, 0, 1 + i * 7)), close };
  });
}

test('portfolio beta uses exchange-specific histories by ID and weights only covered positions', async () => {
  const db = catalogue([instrument('nse', 'DUP'), instrument('bse', 'DUP', 'BSE'), instrument('mf', 'FUND', 'AMFI', { assetType: 'MF' })]);
  const calls = [];
  const yahooClient = { chart: async symbol => { calls.push(symbol); return { quotes: weeklyQuotes(symbol === 'DUP.NS' ? 2 : symbol === 'DUP.BO' ? 0.5 : 1) }; } };
  const result = await collectPortfolioBeta([...holdings, { instrumentId: 'mf', marketValue: 400 }], { db, yahooClient });
  assert.deepEqual(calls.sort(), ['DUP.BO', 'DUP.NS', '^NSEI']);
  assert.ok(Math.abs(result.beta - 0.875) < 1e-8);
  assert.equal(result.coveragePct, 50);
  assert.deepEqual(result.rows.map(r => [r.instrumentId, r.exchange, r.yahooSymbol]), [['nse', 'NSE', 'DUP.NS'], ['bse', 'BSE', 'DUP.BO']]);
  assert.equal(result.missing.length, 0);
});

test('beta unavailable/missing rows retain IDs and never select another listing or invent a zero beta', async () => {
  const db = catalogue([instrument('nse', 'DUP'), instrument('bse', 'DUP', 'BSE', { isin: null })]);
  const calls = [];
  const yahooClient = {
    chart: async symbol => { calls.push(symbol); return { quotes: [] }; },
    quote: async () => ({ beta: null }), quoteSummary: async () => ({ defaultKeyStatistics: { beta: null }, summaryDetail: { beta: null } }),
  };
  const result = await collectPortfolioBeta([...holdings, { instrumentId: 'absent', marketValue: 100 }], { db, yahooClient });
  assert.equal(result.beta, null);
  assert.equal(result.coveragePct, 0);
  assert.equal(result.rows.length, 0);
  assert.ok(!calls.includes('DUP.BO'));
  assert.deepEqual(result.missing.map(row => [row.instrumentId, row.reason]).sort(), [['absent', 'instrument-not-found'], ['bse', 'missing-isin-skipped'], ['nse', 'beta-unavailable']]);
});

test('analytics reject bare symbols, duplicate IDs and invalid weights; empty portfolios make no DB/provider calls', async () => {
  const db = { instrument: { findMany: async () => { throw new Error('Must not query'); } } };
  for (const request of [null, [{ symbol: 'DUP', marketValue: 1 }], [holdings[0], holdings[0]], [{ ...holdings[0], marketValue: -1 }], [{ ...holdings[0], marketValue: Infinity }], [{ ...holdings[0], marketValue: '100' }]]) {
    await assert.rejects(resolveAnalyticsHoldings(request, db), e => e.status === 400);
  }
  const fundamentals = await collectFundamentals([], {}, { db });
  assert.deepEqual(fundamentals.fundamentals, {});
  assert.equal(fundamentals.summary.weightedPE, null);
  assert.deepEqual(fundamentals.summary.marketCapBreakdown, { large: 0, mid: 0, small: 0, etf: 0, unknown: 0 });
  assert.equal((await collectPortfolioBeta([], { db })).beta, null);
});

test('client signatures change for same-count replacements, exchange IDs, weight changes and portfolio/user changes', () => {
  const key = analyticsRequestKey(holdings);
  assert.equal(key, analyticsRequestKey([...holdings].reverse()));
  assert.notEqual(key, analyticsRequestKey([{ ...holdings[0], instrumentId: 'other' }, holdings[1]]));
  assert.notEqual(key, analyticsRequestKey([{ ...holdings[0], marketValue: 200 }, holdings[1]]));
  const betaKey = portfolioBetaCacheSignature('user', 'portfolio', holdings);
  assert.notEqual(betaKey, portfolioBetaCacheSignature('other-user', 'portfolio', holdings));
  assert.notEqual(betaKey, portfolioBetaCacheSignature('user', 'other-portfolio', holdings));
  assert.notEqual(betaKey, portfolioBetaCacheSignature('user', 'portfolio', [{ ...holdings[0], marketValue: 200 }, holdings[1]]));
});

const tick = () => new Promise(resolve => setImmediate(resolve));
test('a cancelled old fundamentals request cannot overwrite a newer result even if fetch ignores AbortSignal', async () => {
  const pending = [];
  const fetcher = (_url, options) => new Promise(resolve => pending.push({ resolve, options }));
  const oldStates = [], newStates = [];
  const cancelOld = startFundamentalsRequest(holdings, { fetcher, onState: state => oldStates.push(state) });
  cancelOld();
  const cancelNew = startFundamentalsRequest([holdings[0]], { fetcher, force: true, onState: state => newStates.push(state) });
  const fresh = { fundamentals: { nse: { pe: 20 } }, summary: {} };
  pending[1].resolve(Response.json(fresh));
  await tick();
  pending[0].resolve(Response.json({ fundamentals: { bse: { pe: 999 } }, summary: {} }));
  await tick();
  assert.equal(oldStates.length, 1);
  assert.equal(pending[0].options.signal.aborted, true);
  assert.deepEqual(newStates.at(-1).data, fresh);
  assert.deepEqual(JSON.parse(pending[1].options.body), { holdings: [holdings[0]], force: true });
  cancelNew();
});

test('fundamentals request failures stop loading, allow retry, and empty portfolios clear stale metrics', async () => {
  const states = [];
  const cancel = startFundamentalsRequest(holdings, { fetcher: async () => new Response(null, { status: 503 }), onState: state => states.push(state) });
  await tick();
  assert.equal(states.at(-1).loading, false);
  assert.match(states.at(-1).error, /Failed to fetch/);
  cancel();
  startFundamentalsRequest([], { fetcher: async () => { throw new Error('Must not fetch'); }, onState: state => states.push(state) });
  assert.deepEqual(states.at(-1), { loading: false, error: null, data: EMPTY_FUNDAMENTALS });
  startFundamentalsRequest(holdings, { fetcher: async () => Response.json({ fundamentals: { nse: { pe: 10 } }, summary: {} }), onState: state => states.push(state) });
  await tick();
  assert.equal(states.at(-1).error, null);
  assert.equal(states.at(-1).data.fundamentals.nse.pe, 10);
});
