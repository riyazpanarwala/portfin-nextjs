import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapPortfolio } from '../../src/lib/portfolioBootstrap.js';
import { loadPortfolioBootstrap } from '../../src/lib/loadPortfolioBootstrap.js';

const session = { userId: 'owner' };
const asOf = new Date().toISOString().slice(0, 10);
const instrument = { id: 'stock', symbol: 'TEST', assetType: 'STOCK', exchange: 'NSE', price: '123.5', priceAsOf: new Date(asOf), priceUpdatedAt: new Date(), priceSource: 'manual' };
const trade = { id: 'trade', instrumentId: 'stock', portfolioId: 'portfolio', instrument, tradeType: 'BUY', quantity: '2', price: '100', tradeDate: new Date('2026-01-01'), createdAt: new Date('2026-01-01') };

function database({ portfolio = { id: 'portfolio', revision: 3 }, trades = [trade] } = {}) {
  const queries = [];
  const tx = {
    portfolio: {
      findFirst: async query => { queries.push(['portfolio', query]); return portfolio; },
      create: async query => { queries.push(['create', query]); return { id: 'new', revision: 0 }; },
    },
    trade: {
      findMany: async query => { queries.push(['trades', query]); return trades; },
      count: async () => trades.length,
    },
    corporateAction: { findMany: async () => { queries.push(['actions']); return [{ id: 'split' }]; } },
  };
  return { queries, $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return run(tx);
  } };
}

test('bootstrap returns the owned ledger and stored prices without price database queries or row locks', async () => {
  const db = database();
  const result = await bootstrapPortfolio(db, session);
  assert.deepEqual(db.queries[0][1].where, { userId: 'owner' });
  assert.equal(result.portfolioId, 'portfolio');
  assert.equal(result.trades[0].quantity, '2');
  assert.equal(result.revision, 3);
  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);
  assert.deepEqual(result.prices, { stock: 123.5 });
  assert.equal(result.meta.stock.providerSource, 'manual');
  assert.equal(result.meta.stock.asOf, asOf);
  assert.deepEqual(result.corporateActions, [{ id: 'split' }]);
  assert.equal(db.queries.find(([name]) => name === 'trades')[1].take, 1000);
});

test('a new account gets its default portfolio and an empty ledger', async () => {
  const db = database({ portfolio: null, trades: [] });
  const result = await bootstrapPortfolio(db, session);
  assert.equal(result.portfolioId, 'new');
  assert.equal(result.total, 0);
  assert.deepEqual(result.prices, {});
  assert.deepEqual(db.queries.find(([name]) => name === 'create')[1].data, { userId: 'owner', name: 'My Portfolio' });
});

test('continuations enforce ownership and reject revision changes before loading trades', async () => {
  const db = database({ portfolio: null });
  await assert.rejects(bootstrapPortfolio(db, session, { portfolioId: 'someone-elses' }), { status: 404 });
  assert.deepEqual(db.queries[0][1].where, { userId: 'owner', id: 'someone-elses' });
  assert.equal(db.queries.length, 1);
  const changed = database();
  await assert.rejects(bootstrapPortfolio(changed, session, { portfolioId: 'portfolio', offset: 1000, revision: 2 }), { status: 409 });
  assert.equal(changed.queries.length, 1);
});

test('continuations do not reload corporate actions and invalid pagination cannot reach the database', async () => {
  const db = database();
  await bootstrapPortfolio(db, session, { portfolioId: 'portfolio', offset: 1000, revision: 3 });
  assert.equal(db.queries.some(([name]) => name === 'actions'), false);
  for (const input of [null, [], { offset: -1 }, { offset: 1 }, { portfolioId: '' }, { revision: '3' }, { portfolioId: 'portfolio', offset: 1000 }]) {
    await assert.rejects(bootstrapPortfolio({}, session, input), { status: 400 });
  }
});

test('missing cached prices and delisted instruments retain unavailable and skipped metadata', async () => {
  const db = database({ trades: [{ ...trade, instrument: { ...instrument, price: null, priceAsOf: null, symbol: 'UTTAMVALUE' } }] });
  const result = await bootstrapPortfolio(db, session);
  assert.deepEqual(result.prices, {});
  assert.equal(result.meta.stock.stale, true);
  assert.equal(result.meta.stock.refreshSkipped, 'delisted');
});

function page(extra = {}) {
  return { portfolioId: 'portfolio', revision: 3, total: 1, trades: [{ id: 'one' }], corporateActions: [{ id: 'split' }], prices: { stock: 123.5 }, meta: { stock: { asOf } }, hasMore: false, ...extra };
}

test('small portfolios need one bootstrap request and pass through cancellation', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await loadPortfolioBootstrap({ signal: controller.signal, fetcher: async (url, options) => {
    calls++;
    assert.equal(url, '/api/portfolio/bootstrap');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.cache, 'no-store');
    assert.deepEqual(JSON.parse(options.body), {});
    return Response.json(page());
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result.prices, { stock: 123.5 });
});

test('large histories merge prices and retain first-page actions while checking revisions', async () => {
  let calls = 0;
  const result = await loadPortfolioBootstrap({ fetcher: async (_url, options) => {
    if (calls++ === 0) return Response.json(page({ total: 2, hasMore: true }));
    assert.deepEqual(JSON.parse(options.body), { portfolioId: 'portfolio', revision: 3, offset: 1 });
    return Response.json(page({ total: 2, trades: [{ id: 'two' }], corporateActions: [], prices: { other: 4 }, meta: { other: { stale: true } } }));
  } });
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.corporateActions, [{ id: 'split' }]);
  assert.deepEqual(result.prices, { stock: 123.5, other: 4 });
  assert.equal(result.meta.other.stale, true);
});

test('loading fails closed on changed, truncated, duplicated, or stalled histories and API failures', async () => {
  for (const second of [page({ revision: 4, total: 2 }), page({ total: 3 }), page({ total: 2 }), page({ total: 2, trades: [], hasMore: true })]) {
    let calls = 0;
    await assert.rejects(loadPortfolioBootstrap({ fetcher: async () => Response.json(calls++ ? second : page({ total: 2, hasMore: true })) }));
  }
  await assert.rejects(loadPortfolioBootstrap({ fetcher: async () => Response.json(page({ total: 2 })) }), /reconcile/);
  await assert.rejects(loadPortfolioBootstrap({ fetcher: async () => Response.json({ error: 'Please sign in.' }, { status: 401 }) }), /Please sign in/);
  await assert.rejects(loadPortfolioBootstrap({ fetcher: async () => { throw new DOMException('Aborted', 'AbortError'); } }), { name: 'AbortError' });
});
