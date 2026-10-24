import test from 'node:test';
import assert from 'node:assert/strict';
import { persistInstrumentPrices } from '../../src/lib/pricePersistence.js';
import { collectInstrumentPrices } from '../../src/lib/priceService.js';

const update = (id, price = 123.4567) => ({ id, price, priceAsOf: new Date('2026-10-23'), priceUpdatedAt: new Date('2026-10-24T06:07:08.123Z'), priceSource: 'yahoo' });

test('empty refreshes make no writes and single prices keep the one-query Prisma path', async () => {
  await persistInstrumentPrices({}, []);
  const row = update('single');
  let writes = 0;
  await persistInstrumentPrices({ instrument: { update: async args => {
    writes++;
    const { id, ...data } = row;
    assert.deepEqual(args, { where: { id }, data });
  } } }, [row]);
  assert.equal(writes, 1);
});

test('twenty distinct prices use one parameterized update in one transaction', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => update(`instrument-${i}`, i + 0.1234));
  rows[0].id = "untrusted'); DROP TABLE instruments; --";
  let transactions = 0, statements = 0;
  const db = { $transaction: async (run, options) => {
    transactions++;
    assert.equal(options.timeout, 20000);
    return run({ $executeRaw: async query => {
      statements++;
      assert.match(query.sql, /UPDATE "instruments"/);
      assert.equal(query.sql.includes(rows[0].id), false);
      assert.equal(query.values.length, 100);
      assert.deepEqual(query.values.slice(0, 5), [rows[0].id, '0.1234', '2026-10-23', '2026-10-24T06:07:08.123Z', 'yahoo']);
      assert.equal(query.values[95], rows[19].id);
      assert.equal(query.values[96], String(rows[19].price));
      return 20;
    } });
  } };
  await persistInstrumentPrices(db, rows);
  assert.equal(transactions, 1);
  assert.equal(statements, 1);
});

test('large refreshes are bounded to 100 instruments per statement and deduplicate IDs', async () => {
  const sizes = [];
  let transactions = 0;
  const db = { $transaction: async run => {
    transactions++;
    return run({ $executeRaw: async query => { const size = query.values.length / 5; sizes.push(size); return size; } });
  } };
  const rows = Array.from({ length: 205 }, (_, i) => update(String(i)));
  await persistInstrumentPrices(db, [...rows, update('0', 999)]);
  assert.equal(transactions, 1);
  assert.deepEqual(sizes, [100, 100, 5]);
});

test('a failed statement or missing instrument rejects the transaction without reporting success', async () => {
  for (const fail of [async () => { throw new Error('Database unavailable'); }, async () => 1]) {
    let committed = false;
    const db = { $transaction: async run => {
      await run({ $executeRaw: fail });
      committed = true;
    } };
    await assert.rejects(persistInstrumentPrices(db, [update('one'), update('two')]));
    assert.equal(committed, false);
  }
});

test('mixed stock and fund prices are persisted together, and the response waits for persistence', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const [year, month, date] = day.split('-');
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1];
  const instruments = [
    { id: 'stock', symbol: 'TEST', assetType: 'STOCK', exchange: 'NSE' },
    { id: 'fund', symbol: 'FUND', assetType: 'MF', exchange: 'AMFI', isin: 'INF000000001' },
  ];
  let release, resolved = false;
  const persisted = new Promise(resolve => { release = resolve; });
  let started;
  const persistenceStarted = new Promise(resolve => { started = resolve; });
  let updates;
  const request = collectInstrumentPrices(instruments, { force: true }, {
    yahooClient: { quote: async () => [{ symbol: 'TEST.NS', regularMarketPrice: 123.4567, regularMarketTime: new Date(day) }] },
    fetcher: async () => new Response(`Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date\n1;INF000000001;;Fund;42.1234;${date}-${monthName}-${year}`),
    persistPrices: async (_db, rows) => { updates = rows; started(); await persisted; },
  }).then(data => { resolved = true; return data; });
  // Reach persistence without releasing it, independently of provider scheduling.
  await Promise.race([persistenceStarted, request.then(() => { throw new Error('Expected persistence to start'); })]);
  assert.equal(resolved, false);
  assert.deepEqual(updates.map(row => [row.id, row.price, row.priceSource]), [['stock', 123.4567, 'yahoo'], ['fund', 42.1234, 'amfi']]);
  release();
  const result = await request;
  assert.equal(result.prices.stock, 123.4567);
  assert.equal(result.meta.fund.asOf, day);
});
