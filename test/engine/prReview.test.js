import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { collectInstrumentPrices } from '../../src/lib/priceService.js';
import { parseAmfiNav } from '../../src/lib/amfiNav.js';
import { readClientSession } from '../../src/lib/clientSession.js';
import { computeHoldings } from '../../src/lib/store.js';

const now = new Date('2026-10-10T06:00:00Z');
const stock = (id, exchange = 'NSE', extra = {}) => ({ id, symbol: 'DUP', assetType: 'STOCK', exchange, price: 100, priceAsOf: new Date('2026-10-09'), priceUpdatedAt: new Date('2026-10-09'), priceSource: 'yahoo', ...extra });
const quote = (symbol, price, date = '2026-10-09T10:00:00Z') => ({ symbol, regularMarketPrice: price, regularMarketTime: new Date(date) });
function dependencies(quotes) {
  const calls = [], writes = [];
  return { calls, writes, db: { instrument: { update: async data => { writes.push(data); } } },
    yahooClient: { quote: async (...args) => { calls.push(args); return quotes; } },
    fetcher: async () => { throw new Error('Unexpected AMFI request'); } };
}

test('Yahoo refresh batches exchange-specific symbols and maps reordered results to instrument IDs', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const deps = dependencies([quote('DUP.BO', 220), quote('DUP.NS', 110)]);
  const result = await collectInstrumentPrices([stock('nse'), stock('bse', 'BSE')], { force: true }, deps);
  assert.equal(deps.calls.length, 1);
  assert.deepEqual(deps.calls[0][0], ['DUP.NS', 'DUP.BO']);
  assert.equal(deps.calls[0][2].timeout, 15000);
  assert.deepEqual(result.prices, { nse: 110, bse: 220 });
  assert.equal(result.meta.nse.source, 'yahoo');
  assert.equal(result.meta.bse.asOf, '2026-10-09');
  assert.equal(result.meta.DUP, undefined);
  assert.deepEqual(deps.writes.map(w => [w.where.id, w.data.price]), [['nse', 110], ['bse', 220]]);
});

test('missing, invalid, stale or future Yahoo quotes preserve cache while valid results update', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const rows = ['GOOD', 'MISSING', 'INVALID', 'BADDATE', 'FUTURE', 'OLDER'].map(symbol => stock(symbol, 'NSE', { symbol }));
  const deps = dependencies([quote('GOOD.NS', 150), quote('INVALID.NS', NaN), quote('BADDATE.NS', 160, 'bad'), quote('FUTURE.NS', 170, '2026-10-11'), quote('OLDER.NS', 180, '2026-10-08')]);
  const result = await collectInstrumentPrices(rows, { force: true }, deps);
  assert.equal(result.prices.GOOD, 150);
  for (const id of rows.slice(1).map(r => r.id)) {
    assert.equal(result.prices[id], 100);
    assert.equal(result.meta[id].source, 'cache');
    assert.equal(result.meta[id].asOf, '2026-10-09');
  }
  assert.equal(deps.writes.length, 1);
});

test('provider failure keeps dated cache and does not write prices', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const deps = dependencies([]);
  deps.yahooClient.quote = async () => { throw new Error('Provider unavailable'); };
  const result = await collectInstrumentPrices([stock('nse')], { force: true }, deps);
  assert.equal(result.prices.nse, 100);
  assert.equal(result.meta.nse.source, 'cache');
  assert.equal(deps.writes.length, 0);
});

test('a database failure cannot be reported as a successful live price refresh', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const deps = dependencies([quote('DUP.NS', 150)]);
  deps.db.instrument.update = async () => { throw new Error('Database unavailable'); };
  await assert.rejects(collectInstrumentPrices([stock('nse')], { force: true }, deps), /Database unavailable/);
});

test('MF refresh persists the exact ISIN NAV and its UTC publication date', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const deps = dependencies([]);
  deps.fetcher = async () => new Response(navText);
  const result = await collectInstrumentPrices([{ ...stock('mf'), assetType: 'MF', isin: 'INF000000001', priceAsOf: new Date('2026-09-30') }], { force: true }, deps);
  assert.equal(result.prices.mf, 123.45);
  assert.equal(result.meta.mf.source, 'amfi');
  assert.equal(result.meta.mf.asOf, '2026-10-01');
  assert.equal(result.meta.mf.stale, true);
  assert.equal(deps.writes[0].data.priceAsOf.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(deps.calls.length, 0);
});

test('cache-only and fresh cache avoid external requests and database writes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  for (const [rows, options] of [[[stock('nse'), { ...stock('mf'), assetType: 'MF' }], { cacheOnly: true, force: true }], [[stock('nse', 'NSE', { priceUpdatedAt: now })], {}]]) {
    const deps = dependencies([]);
    const result = await collectInstrumentPrices(rows, options, deps);
    assert.equal(result.prices.nse, 100);
    assert.equal(deps.calls.length, 0);
    assert.equal(deps.writes.length, 0);
  }
});

test('a missing canonical price never inherits another exchange price through a symbol alias', () => {
  const rows = ['nse', 'bse'].map((instrumentId, index) => ({ id: `trade-${index}`, instrumentId, symbol: 'DUP', assetType: 'STOCK', exchange: index ? 'BSE' : 'NSE', tradeType: 'BUY', tradeDate: '2026-01-01', quantity: 10, price: 100 }));
  const holdings = computeHoldings(rows, { nse: 150, DUP: 150 }, { asOf: '2026-10-10' });
  assert.equal(holdings.find(h => h.instrumentId === 'nse').cmp, 150);
  assert.equal(holdings.find(h => h.instrumentId === 'bse').priceAvailable, false);
});

const navText = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date\n1;INF000000001;;Example;123.45;01-Oct-2026';
test('AMFI date remains the published calendar day in UTC, India and US timezones', () => {
  const moduleUrl = new URL('../../src/lib/amfiNav.js', import.meta.url).href;
  const script = `import {parseAmfiNav} from ${JSON.stringify(moduleUrl)}; console.log(parseAmfiNav(${JSON.stringify(navText)}).get('INF000000001').asOf);`;
  for (const TZ of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
    const day = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }).trim();
    assert.equal(day, '2026-10-01', TZ);
  }
});

test('AMFI rejects impossible and malformed dates instead of normalizing them', () => {
  for (const date of ['31-Feb-2026', '00-Oct-2026', '01-Abc-2026', '2026-10-01']) {
    assert.throws(() => parseAmfiNav(navText.replace('01-Oct-2026', date)), /unavailable/);
  }
  assert.equal(parseAmfiNav(navText.replace('01-Oct-2026', '29-Feb-2024')).get('INF000000001').asOf, '2024-02-29');
});

test('AMFI handles duplicate ISIN entries by preferring newer dates and omitting ambiguous same-day conflicts', () => {
  const header = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date';
  const csv = [
    header,
    '101;INF000000001;-;Old Scheme;10.00;01-Oct-2025',
    '102;INF000000001;-;New Scheme;15.50;01-Oct-2026',
    '201;INF000000002;-;Dual Scheme A;20.00;01-Oct-2026',
    '202;INF000000002;-;Dual Scheme B;20.00;01-Oct-2026',
    '301;INF000000003;-;Conflict A;30.00;01-Oct-2026',
    '302;INF000000003;-;Conflict B;35.00;01-Oct-2026',
    '401;INF000000004;-;Normal Fund;40.00;01-Oct-2026',
  ].join('\n');
  const map = parseAmfiNav(csv);
  assert.equal(map.get('INF000000001').price, 15.50);
  assert.equal(map.get('INF000000001').asOf, '2026-10-01');
  assert.equal(map.get('INF000000002').price, 20.00);
  assert.equal(map.get('INF000000003'), undefined);
  assert.equal(map.get('INF000000004').price, 40.00);
});

test('session verification returns signed-out only on 401 and supports retry after a failure', async () => {
  assert.equal(await readClientSession({ fetcher: async () => new Response(null, { status: 401 }) }), null);
  for (const status of [403, 429, 500, 503]) {
    await assert.rejects(readClientSession({ fetcher: async () => new Response(null, { status }) }), /Unable to verify/);
  }
  await assert.rejects(readClientSession({ fetcher: async () => { throw new Error('Network offline'); } }), /Network offline/);
  await assert.rejects(readClientSession({ fetcher: async () => Response.json({}) }), /Unable to verify/);
  const controller = new AbortController();
  const user = { id: 'owner', email: 'owner@example.com' };
  assert.deepEqual(await readClientSession({ signal: controller.signal, fetcher: async (url, options) => {
    assert.equal(url, '/api/auth/session'); assert.equal(options.cache, 'no-store'); assert.equal(options.signal, controller.signal);
    return Response.json({ user });
  } }), user);
});
