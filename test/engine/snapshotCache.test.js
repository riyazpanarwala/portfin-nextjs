import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotCache } from '../../src/lib/snapshotCache.js';
import { upsertInstruments } from '../../src/lib/upsertInstruments.js';
import { createSnapshotReader } from '../../src/lib/snapshotReader.js';
import { snapshotWithStockReturn, buildSnapshotData } from '../../src/lib/snapshotValuation.js';

const rows = Array.from({ length: 250 }, (_, i) => ({ id: String(i), snapshotAt: new Date(Date.UTC(2026, 0, 250 - i)).toISOString() }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('invalidation keeps mounted views loading and leaves unsubscribed or retired entries idle', async () => {
  const cache = createSnapshotCache({ fetcher: async () => Response.json({ snapshots: rows }) });
  const live = cache.entryFor('owner', 'portfolio');
  const idle = cache.entryFor('owner', 'other');
  await Promise.all([cache.load(live, 1000), cache.load(idle, 1000)]);
  const states = [];
  const unsubscribe = cache.subscribe(live, () => states.push(live.state));
  cache.invalidateUser('owner');
  assert.equal(states.at(-1).loading, true);
  assert.deepEqual(states.at(-1).rows, []);
  assert.equal(idle.state.loading, false);
  await cache.load(live, 1000);
  assert.equal(live.state.loading, false);
  cache.clear();
  assert.equal(states.at(-1).loading, false);
  unsubscribe();
});

test('instrument updates invalidate all cached portfolios, including partial import successes', async () => {
  let calls = 0;
  const cache = createSnapshotCache({ fetcher: async () => { calls++; return Response.json({ snapshots: rows }); } });
  const entries = [cache.entryFor('owner', 'first'), cache.entryFor('owner', 'second')];
  await Promise.all(entries.map(entry => cache.load(entry, 1000)));
  const instruments = [{ symbol: 'TEST', exchange: 'NSE' }];
  for (const updated of [0, 1]) {
    await upsertInstruments(instruments, { cache, fetcher: async (url, options) => {
      assert.equal(url, '/api/instruments/bulk');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { instruments });
      return Response.json({ created: 1, updated, skipped: 1, errors: ['Skipped invalid row'] });
    } });
    assert.ok(entries.every(entry => entry.state.rows.length === (updated ? 0 : rows.length)));
  }
  await Promise.all(entries.map(entry => cache.load(entry, 1000)));
  assert.equal(calls, 4);
  await assert.rejects(upsertInstruments(instruments, { cache, fetcher: async () => Response.json({ error: 'Forbidden' }, { status: 403 }) }), /Forbidden/);
  assert.ok(entries.every(entry => entry.state.rows.length === rows.length));
});

test('a failed expansion remains retryable by a view with a smaller limit', async () => {
  let calls = 0;
  const cache = createSnapshotCache({ fetcher: async () => {
    calls++;
    return calls === 2 ? Response.json({}, { status: 500 }) : Response.json({ snapshots: [rows[0]] });
  } });
  const entry = cache.entryFor('owner', 'portfolio');
  await cache.load(entry, 1);
  await assert.rejects(cache.load(entry, 100), /500/);
  await cache.load(entry, 1);
  assert.equal(calls, 3);
  assert.equal(entry.state.error, null);
  assert.deepEqual(entry.state.rows, [rows[0]]);
});

test('shared snapshot cache deduplicates requests and reuses a larger or complete response across views', async () => {
  let calls = 0;
  const cache = createSnapshotCache({ fetcher: async () => { calls++; return Response.json({ snapshots: rows }); } });
  const entry = cache.entryFor('owner', 'portfolio');
  await Promise.all([cache.load(entry, 1000), cache.load(entry, 1000), cache.load(entry, 100)]);
  await cache.load(entry, 200);
  assert.equal(calls, 1);
  assert.equal(entry.state.rows.length, 250);
  assert.equal(entry.state.loading, false);
  assert.equal(cache.entryFor('owner', 'portfolio'), entry);
  assert.notEqual(cache.entryFor('other', 'portfolio'), entry);
});

test('a truncated response is expanded for a larger view and refreshes after TTL or invalidation', async () => {
  let time = 100, calls = 0;
  const cache = createSnapshotCache({ now: () => time, ttl: 1000, fetcher: async url => {
    calls++;
    const limit = Number(new URL(url, 'http://test').searchParams.get('limit'));
    return Response.json({ snapshots: rows.slice(0, limit) });
  } });
  const entry = cache.entryFor('owner', 'portfolio');
  await cache.load(entry, 100);
  await cache.load(entry, 200);
  assert.equal(calls, 2);
  await cache.load(entry, 100);
  assert.equal(calls, 2);
  time += 1001;
  await cache.load(entry, 100);
  cache.invalidatePortfolio('portfolio');
  assert.deepEqual(entry.state.rows, []);
  await cache.load(entry, 100);
  await cache.load(entry, 100, { force: true });
  assert.equal(calls, 5);
});

test('late responses cannot overwrite invalidated data, and clearing on logout retires pending requests', async () => {
  const old = deferred();
  let calls = 0;
  const cache = createSnapshotCache({ fetcher: async () => ++calls === 1 ? old.promise : Response.json({ snapshots: [rows[1]] }) });
  const entry = cache.entryFor('owner', 'portfolio');
  const first = cache.load(entry, 100);
  const waiter = cache.load(entry, 200);
  await Promise.resolve();
  cache.invalidatePortfolio('portfolio');
  await cache.load(entry, 100);
  old.resolve(Response.json({ snapshots: [rows[0]] }));
  await Promise.all([first, waiter]);
  assert.deepEqual(entry.state.rows, [rows[1]]);
  assert.equal(calls, 2);
  cache.clear();
  await cache.load(entry, 100);
  assert.equal(calls, 2);
  assert.deepEqual(entry.state.rows, []);
  assert.notEqual(cache.entryFor('owner', 'portfolio'), entry);
});

test('in-flight responses from before logout are discarded even if fetch ignores cancellation', async () => {
  const pending = deferred();
  const cache = createSnapshotCache({ fetcher: () => pending.promise });
  const entry = cache.entryFor('owner', 'portfolio');
  const request = cache.load(entry, 100);
  await Promise.resolve();
  cache.clear();
  pending.resolve(Response.json({ snapshots: rows }));
  await request;
  assert.deepEqual(entry.state.rows, []);
});

test('snapshot fetch errors are visible and retryable without caching an empty success', async () => {
  let calls = 0;
  const cache = createSnapshotCache({ fetcher: async () => ++calls === 1 ? Response.json({}, { status: 500 }) : Response.json({ snapshots: [] }) });
  const entry = cache.entryFor('owner', 'portfolio');
  await assert.rejects(cache.load(entry, 100), /500/);
  assert.ok(entry.state.error);
  assert.equal(entry.state.loading, false);
  await cache.load(entry, 100);
  assert.equal(entry.state.error, null);
  assert.equal(calls, 2);
});

const date = '2026-10-16';
const trade = { id: 'buy', instrumentId: 'stock', symbol: 'TEST', assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', tradeDate: '2024-10-16', createdAt: '2024-10-16', quantity: '2', price: '100' };
const raw = { ...trade, instrument: { id: 'stock', symbol: 'TEST', name: 'Test', assetType: 'STOCK', exchange: 'NSE' }, tradeDate: new Date(trade.tradeDate), createdAt: new Date(trade.createdAt) };
const saved = { id: 'snapshot', snapshotAt: new Date(date), ...buildSnapshotData([trade], { stock: 121 }, { stock: { asOf: date } }, { asOf: date, revision: 1 }) };
function database() {
  const state = { saved: [saved], revision: 1, owner: true, ledgerReads: 0, transactions: 0, inTransaction: false };
  const tx = {
    portfolio: { findFirst: async query => { assert.deepEqual(query.where, { id: 'portfolio', userId: 'owner' }); return state.owner ? { revision: state.revision } : null; } },
    snapshot: { findMany: async () => state.saved },
    trade: { findMany: async () => { state.ledgerReads++; return [raw]; } },
    corporateAction: { findMany: async () => [] },
  };
  return { state, $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    state.transactions++; state.inTransaction = true;
    try { return await run(tx); } finally { state.inTransaction = false; }
  } };
}
const session = { userId: 'owner' };

test('snapshot reader preserves historical corrections, releases the transaction before computing, and skips repeated ledger reads', async () => {
  const db = database();
  let calculations = 0;
  const read = createSnapshotReader({ calculate: (...args) => {
    assert.equal(db.state.inTransaction, false);
    calculations++;
    return snapshotWithStockReturn(...args);
  } });
  const expected = snapshotWithStockReturn(saved, [trade]);
  assert.deepEqual(await read(db, session, 'portfolio', 100), [expected]);
  assert.deepEqual(await read(db, session, 'portfolio', 200), [expected]);
  assert.equal(calculations, 1);
  assert.equal(db.state.ledgerReads, 1);
  assert.equal(db.state.transactions, 2);
  db.state.owner = false;
  await assert.rejects(read(db, session, 'portfolio', 100), { status: 404 });
});

test('snapshot reader invalidates on ledger revisions, same-minute updates and TTL expiry', async () => {
  let time = 100;
  const db = database();
  const read = createSnapshotReader({ now: () => time, ttl: 1000 });
  await read(db, session, 'portfolio', 100);
  db.state.revision++;
  await read(db, session, 'portfolio', 100);
  db.state.saved = [{ ...saved, totalValue: '999' }];
  assert.equal((await read(db, session, 'portfolio', 100))[0].totalValue, '999');
  time += 1001;
  await read(db, session, 'portfolio', 100);
  assert.equal(db.state.ledgerReads, 4);
});

test('empty, stale and user-verified snapshots require no ledger reads and retain unavailable returns', async () => {
  const db = database();
  const read = createSnapshotReader();
  db.state.saved = [];
  assert.deepEqual(await read(db, session, 'portfolio', 100), []);
  db.state.saved = [{ ...saved, stale: true }, { ...saved, engineVersion: 'user-accepted-v1', priceProvenance: { __verification: { source: 'user-acknowledgement' } } }];
  const result = await read(db, session, 'portfolio', 100);
  assert.equal(db.state.ledgerReads, 0);
  assert.ok(result.every(row => row.stCagr === null && row.stockReturnMethod === 'unavailable'));
});
