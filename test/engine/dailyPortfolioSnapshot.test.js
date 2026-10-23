import test from 'node:test';
import assert from 'node:assert/strict';
import { runDailyPortfolioSnapshots, indiaDate, dailySnapshotId } from '../../src/lib/dailyPortfolioSnapshot.js';

const now = new Date('2026-10-23T18:17:11Z');
function fixture() {
  const instruments = {
    A: { id: 'A', symbol: 'A', name: 'Stock A', exchange: 'NSE', assetType: 'STOCK', price: '100', priceAsOf: new Date('2026-10-22'), priceSource: 'yahoo' },
    B: { id: 'B', symbol: 'B', name: 'Fund B', assetType: 'MF', price: '100', priceAsOf: new Date('2026-10-22'), priceSource: 'amfi' },
  };
  const portfolios = [{ id: 'p1', userId: 'u1', revision: 3 }];
  const trades = [];
  const actions = [];
  const snapshots = new Map();
  const calls = [];
  const add = (instrumentId, portfolioId = 'p1', tradeType = 'BUY', tradeDate = '2026-01-01') => trades.push({
    id: `t${trades.length}`, instrumentId, portfolioId, instrument: instruments[instrumentId], tradeType,
    quantity: '10', price: '100', brokerage: null, tradeDate: new Date(tradeDate), createdAt: new Date(tradeDate),
  });
  const db = {
    portfolio: {
      findMany: async query => { assert.equal(query.where.user.email.equals, 'owner@example.com'); return portfolios; },
      updateMany: async query => { calls.push(['lock', query]); return { count: 1 }; },
      findUnique: async query => portfolios.find(p => p.id === query.where.id),
    },
    trade: { findMany: async query => trades.filter(t => t.portfolioId === query.where.portfolioId) },
    corporateAction: { findMany: async query => actions.filter(a => a.portfolioId === query.where.portfolioId) },
    snapshot: { upsert: async query => {
      calls.push(['snapshot', query]);
      const value = snapshots.has(query.where.id) ? { ...snapshots.get(query.where.id), ...query.update } : query.create;
      snapshots.set(query.where.id, value);
      return value;
    } },
    $transaction: async callback => callback(db),
  };
  const collectPrices = async (group, options, dependencies) => {
    assert.equal(options.force, true);
    assert.equal(dependencies.db, db);
    calls.push(['refresh', group.map(i => i.id)]);
    const meta = {};
    for (const instrument of group) {
      instrument.price = '110';
      instrument.priceAsOf = new Date('2026-10-23');
      meta[instrument.id] = { source: instrument.assetType === 'MF' ? 'amfi' : 'yahoo', asOf: '2026-10-23', stale: false };
    }
    return { meta };
  };
  const run = (overrides = {}) => runDailyPortfolioSnapshots({ db, collectPrices, ownerEmail: 'owner@example.com', now, ...overrides });
  return { instruments, portfolios, trades, actions, snapshots, calls, db, collectPrices, add, run };
}

test('daily job refreshes both asset classes before saving verified snapshots with existing schema', async () => {
  const f = fixture(); f.add('A'); f.add('B');
  const result = await f.run();
  assert.equal(result.saved, 1);
  assert.equal(result.refreshed, 2);
  assert.deepEqual(result.failures, []);
  const saved = [...f.snapshots.values()][0];
  assert.equal(saved.totalValue, '2200.00');
  assert.equal(saved.ledgerRevision, 3);
  assert.equal(saved.stale, false);
  assert.equal(saved.priceProvenance.A.asOf, '2026-10-23');
  assert.equal(saved.valuationAt.toISOString().slice(0, 10), '2026-10-23');
  assert.ok(f.calls.findIndex(c => c[0] === 'snapshot') > f.calls.findLastIndex(c => c[0] === 'refresh'));
  assert.equal(saved.snapshotAt.getMilliseconds(), 1);
});

test('reruns update the daily automation checkpoint and preserve manual checkpoints', async () => {
  const f = fixture(); f.add('A');
  f.snapshots.set('manual-id', { id: 'manual-id', totalValue: '999.00' });
  await f.run(); await f.run({ now: new Date('2026-10-23T18:20:00Z') });
  assert.equal(f.snapshots.size, 2);
  assert.equal(f.snapshots.get('manual-id').totalValue, '999.00');
  await f.run({ now: new Date('2026-10-24T18:17:00Z') });
  assert.equal(f.snapshots.size, 3);
});

test('owner configuration is mandatory and never falls back to all accounts', async () => {
  const f = fixture();
  await assert.rejects(f.run({ ownerEmail: '' }), /PORTFOLIO_OWNER_EMAIL/);
  assert.equal(f.calls.length, 0);
  f.portfolios.length = 0;
  await assert.rejects(f.run(), /No portfolios match/);
});

test('a failed provider refresh does not silently use the cached quote for a snapshot', async () => {
  const f = fixture(); f.add('A');
  const result = await f.run({ collectPrices: async () => ({ meta: { A: { source: 'cache', asOf: '2026-10-22', stale: false } } }) });
  assert.equal(result.saved, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(f.snapshots.size, 0);
});

test('one provider failure does not block a different fully covered portfolio', async () => {
  const f = fixture(); f.add('A'); f.add('B', 'p2');
  f.portfolios.push({ id: 'p2', userId: 'u1', revision: 1 });
  const result = await f.run({ collectPrices: async (group, ...rest) => {
    if (group[0].assetType === 'MF') throw new Error('provider unavailable');
    return f.collectPrices(group, ...rest);
  } });
  assert.equal(result.saved, 1);
  assert.equal(result.failures[0].portfolioId, 'p2');
});

test('closed and empty holdings are not refreshed', async () => {
  const f = fixture(); f.add('A'); f.add('A', 'p1', 'SELL', '2026-02-01');
  f.portfolios.push({ id: 'empty', userId: 'u1', revision: 0 });
  const result = await f.run();
  assert.equal(result.eligible, 0);
  assert.equal(result.saved, 1);
  assert.equal(result.skippedEmpty, 1);
  assert.equal(f.calls.filter(c => c[0] === 'refresh').length, 0);
});

test('a new active instrument added during refresh is rejected until it too has been refreshed', async () => {
  const f = fixture(); f.add('A');
  const result = await f.run({ collectPrices: async (...args) => {
    const prices = await f.collectPrices(...args);
    f.add('B');
    return prices;
  } });
  assert.equal(result.saved, 0);
  assert.match(result.failures[0].message, /refresh missing for B/);
});

test('a published price before a split cannot value post-split units', async () => {
  const f = fixture(); f.add('A');
  f.actions.push({ id: 'split', portfolioId: 'p1', instrumentId: 'A', actionType: 'SPLIT', exDate: new Date('2026-10-23'), ratioNumerator: 2, ratioDenominator: 1 });
  const result = await f.run({ collectPrices: async () => ({ meta: { A: { source: 'yahoo', asOf: '2026-10-22', stale: false } } }) });
  assert.equal(result.saved, 0);
  assert.match(result.failures[0].message, /predates a corporate action/);
});

test('delisted stocks are not fetched and cannot bypass snapshot freshness validation', async () => {
  const f = fixture(); f.instruments.A.symbol = 'UTTAMVALUE'; f.add('A');
  f.instruments.A.priceAsOf = new Date('2020-01-01');
  const result = await f.run();
  assert.equal(result.eligible, 0);
  assert.equal(result.saved, 0);
  assert.match(result.failures[0].message, /stale valuation price/);
});

test('IST midnight and deterministic daily identity use the portfolio and local day', () => {
  assert.equal(indiaDate(new Date('2026-10-23T20:00:00Z')), '2026-10-24');
  assert.equal(dailySnapshotId('p1', '2026-10-23'), dailySnapshotId('p1', '2026-10-23'));
  assert.notEqual(dailySnapshotId('p1', '2026-10-23'), dailySnapshotId('p2', '2026-10-23'));
  assert.notEqual(dailySnapshotId('p1', '2026-10-23'), dailySnapshotId('p1', '2026-10-24'));
});
