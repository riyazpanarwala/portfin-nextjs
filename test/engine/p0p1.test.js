import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHoldings, computeCapitalGainsReport, computeRealizedSummary, simulateTaxHarvesting, generateSchedule112ACsv } from '../../src/lib/store.js';
import { buildSnapshotData } from '../../src/lib/snapshotValuation.js';
import { parseAmfiNav } from '../../src/lib/amfiNav.js';
import { loadTradeHistory } from '../../src/lib/loadTradeHistory.js';
import { newSessionToken, hashSessionToken, findSession, isAdministrator } from '../../src/lib/sessionTokens.js';
import { requireOwnedPortfolio, requireAdmin, requireSession, createSession, destroySession } from '../../src/lib/auth.js';
import { withErrorHandler } from '../../src/lib/apiHelpers.js';
import { NextResponse } from 'next/server.js';
import { reviseLedger } from '../../src/lib/ledger.js';

const trade = (id, type, date, qty, price, extra = {}) => ({ id, instrumentId: 'stock-a', symbol: 'A', name: 'A', assetType: 'STOCK', exchange: 'NSE', taxCategory: 'EQUITY_ELIGIBLE', tradeType: type, tradeDate: date, quantity: String(qty), price: String(price), createdAt: `${date}T01:00:00Z`, ...extra });
const at = '2026-10-01';
test('API boundary denies forged client identity and cross-origin writes before handlers run', async () => {
  let calls = 0;
  const db = { session: { findUnique: async () => ({ userId: 'owner', user: { email: 'owner@example.com' }, expiresAt: new Date(Date.now() + 60000) }) } };
  const authenticate = request => requireSession(request, db);
  const handler = withErrorHandler('test protected', async (_request, { session }) => { calls++; return NextResponse.json({ userId: session.userId }); }, { authenticate });
  assert.equal((await handler(new Request('https://portfin.test/api/trades?userId=victim', { headers: { 'x-user-id': 'victim', cookie: 'portfin_session=user-id' } }))).status, 401);
  assert.equal((await handler(new Request('https://portfin.test/api/trades', { method: 'POST', headers: { origin: 'https://attacker.test' } }))).status, 403);
  assert.equal(calls, 0);
  const token = newSessionToken();
  const response = await handler(new Request('https://portfin.test/api/trades?userId=victim', { headers: { cookie: `portfin_session=${token}` } }));
  assert.equal((await response.json()).userId, 'owner');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const admin = withErrorHandler('test admin', async () => { throw new Error('Must not run'); }, { admin: true, authenticate });
  assert.equal((await admin(new Request('https://portfin.test/api/catalogue', { headers: { cookie: `portfin_session=${token}` } }))).status, 403);
});
test('login cookies are HttpOnly and logout revokes the stored token hash', async () => {
  let saved, deleted;
  const db = { session: { create: async query => { saved = query.data; }, deleteMany: async query => { deleted = query.where; } } };
  const response = await createSession('owner', NextResponse.json({ ok: true }), db);
  const cookie = response.cookies.get('portfin_session');
  assert.equal(saved.userId, 'owner'); assert.equal(saved.tokenHash, hashSessionToken(cookie.value));
  assert.ok(response.headers.get('set-cookie').includes('HttpOnly')); assert.ok(response.headers.get('set-cookie').includes('SameSite=lax'));
  const logout = await destroySession(new Request('https://portfin.test/logout', { headers: { cookie: `portfin_session=${cookie.value}` } }), NextResponse.json({ ok: true }), db);
  assert.equal(deleted.tokenHash, saved.tokenHash); assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
});
test('sessions use unpredictable hashed tokens, reject forged and expired cookies, and fail closed for admins', async () => {
  const token = newSessionToken();
  assert.equal(token.length, 43);
  assert.notEqual(token, newSessionToken());
  let queried;
  const db = { session: { findUnique: async query => { queried = query; return { userId: 'u', expiresAt: new Date('2026-10-02') }; } } };
  assert.equal(await findSession('user-id', db), null);
  assert.equal(queried, undefined);
  assert.equal((await findSession(token, db, new Date(at))).userId, 'u');
  assert.equal(queried.where.tokenHash, hashSessionToken(token));
  assert.equal(await findSession(token, db, new Date('2026-10-02')), null);
  assert.equal(isAdministrator('admin@example.com', ''), false);
  assert.equal(isAdministrator('Admin@example.com', 'admin@example.com'), true);
  assert.throws(() => requireAdmin({ isAdmin: false }), e => e.status === 403);
});
test('ownership filters the authenticated user and conceals other portfolios', async () => {
  let where;
  const db = { portfolio: { findFirst: async query => { where = query.where; return null; } } };
  await assert.rejects(requireOwnedPortfolio('victim', { userId: 'attacker' }, db), e => e.status === 404);
  assert.deepEqual(where, { id: 'victim', userId: 'attacker' });
});
test('FIFO retains unmatched early sales and never consumes later acquisitions', () => {
  const holdings = computeHoldings([trade('s', 'SELL', '2026-01-01', 5, 200), trade('b', 'BUY', '2026-02-01', 10, 100)], { 'stock-a': 200 }, { asOf: at });
  assert.equal(holdings[0].qty, 10);
  assert.equal(holdings[0].unmatchedSellQty, 5);
  assert.equal(holdings[0].sells.length, 1);
  assert.equal(computeCapitalGainsReport(holdings, { fy: '2025-26' }).taxEstimateAvailable, false);
  assert.throws(() => buildSnapshotData([trade('s', 'SELL', '2026-01-01', 5, 200)], {}, {}, { asOf: at, revision: 0 }), /Unmatched/);
});
test('FIFO applies stable same-day ordering and allocates buy/sell fees across partial sales', () => {
  const rows = [trade('b', 'BUY', '2026-04-01', 10, 100, { brokerage: 10, taxBrokerage: 5 }), trade('s', 'SELL', '2026-05-01', 4, 200, { brokerage: 8, taxBrokerage: 4 })];
  const h = computeHoldings(rows, {}, { asOf: at })[0];
  assert.equal(h.invested, 606);
  assert.equal(h.realizedGain, 388);
  const report = computeCapitalGainsReport([h], { fy: '2026-27' });
  assert.equal(report.grossStcg, 394);
  assert.equal(report.taxEstimateAvailable, true);
  const sameDay = computeHoldings([trade('b', 'BUY', at, 10, 100, { createdAt: `${at}T02:00:00Z` }), trade('s', 'SELL', at, 3, 200)], {}, { asOf: at })[0];
  assert.equal(sameDay.unmatchedSellQty, 3);
});
test('splits replay without ledger mutation and bonus units retain a separate zero-cost acquisition', () => {
  const rows = [trade('b', 'BUY', '2024-01-01', 10, 100), trade('s', 'SELL', '2025-01-01', 4, 120)];
  const original = JSON.stringify(rows);
  const event = { id: 'event', instrumentId: 'stock-a', exDate: '2026-01-01', ratioNumerator: 1, ratioDenominator: 1, actionType: 'BONUS' };
  const before = computeHoldings(rows, {}, { asOf: '2025-12-31', corporateActions: [event] })[0];
  const after = computeHoldings(rows, {}, { asOf: at, corporateActions: [event] })[0];
  assert.equal(before.qty, 6); assert.equal(after.qty, 12);
  assert.equal(after.invested, 600); assert.equal(after.lots[1].price, 0); assert.equal(after.lots[1].date, '2026-01-01');
  const split = computeHoldings(rows, {}, { asOf: at, corporateActions: [{ ...event, actionType: 'SPLIT', ratioNumerator: 2 }] })[0];
  assert.equal(split.qty, 12); assert.equal(split.invested, 600); assert.equal(split.realizedGain, before.realizedGain);
  assert.equal(JSON.stringify(rows), original);
});
test('snapshots reject absent, zero, stale or future prices; valuation uses its historical date', () => {
  const rows = [trade('b', 'BUY', '2024-01-01', 10, 100), trade('future', 'BUY', '2027-01-01', 20, 100)];
  for (const [prices, meta] of [[{}, {}], [{ 'stock-a': 0 }, { 'stock-a': { asOf: at } }], [{ 'stock-a': 120 }, { 'stock-a': { asOf: '2026-09-01' } }], [{ 'stock-a': 120 }, { 'stock-a': { asOf: '2026-10-02' } }]]) {
    assert.throws(() => buildSnapshotData(rows, prices, meta, { asOf: at, revision: 3 }), /Missing or stale/);
  }
  const snapshot = buildSnapshotData(rows, { 'stock-a': 120 }, { 'stock-a': { asOf: at, source: 'test' } }, { asOf: at, revision: 3 });
  assert.equal(snapshot.totalValue, 1200); assert.equal(snapshot.totalInvested, 1000); assert.equal(snapshot.ledgerRevision, 3);
  assert.equal(snapshot.priceProvenance['stock-a'].asOf, at);
  assert.equal(computeHoldings(rows, {}, { asOf: '2024-02-01' })[0].holdingDays, 31);
});
test('ledger changes invalidate affected snapshots in the same transaction', async () => {
  let update, stale;
  await reviseLedger({ portfolio: { update: async v => { update = v; } }, snapshot: { updateMany: async v => { stale = v; } } }, 'p', '2026-01-01');
  assert.equal(update.where.id, 'p'); assert.equal(update.data.revision.increment, 1);
  assert.equal(stale.data.stale, true); assert.equal(stale.where.portfolioId, 'p');
});
test('AMFI uses the NAV header and exact ISIN, never a scheme-name resemblance', () => {
  const header = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date';
  const map = parseAmfiNav(`${header}\n100;INF000000001;-;Similar Growth Fund;123.4567;01-Oct-2026\n101;INF000000002;-;Similar Direct Fund;98.1234;01-Oct-2026`);
  assert.equal(map.get('INF000000001').price, 123.4567); assert.equal(map.get('INF000000002').schemeCode, '101'); assert.equal(map.get('Similar Growth Fund'), undefined);
});
test('trade loading fetches more than 1000 rows and rejects mixed revisions or duplicated pages', async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({ id: String(id) }));
  let calls = 0;
  const fetcher = async url => { calls++; const offset = Number(new URL(url, 'http://local').searchParams.get('offset')); return { ok: true, json: async () => ({ trades: rows.slice(offset, offset + 1000), total: 1001, revision: 2, hasMore: offset === 0 }) }; };
  assert.equal((await loadTradeHistory('p', { fetcher })).trades.length, 1001); assert.equal(calls, 2);
  let page = 0;
  await assert.rejects(loadTradeHistory('p', { fetcher: async () => ({ ok: true, json: async () => ({ trades: [{ id: 'a' }], total: 2, revision: page++, hasMore: page === 1 }) }) }), /changed/);
});
test('tax eligibility and grandfathering block exports; exact anniversary is short term and annual totals exclude prior years', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-10T06:00:00Z') });
  const rows = [trade('b', 'BUY', '2024-05-01', 10, 100), trade('s', 'SELL', '2025-05-01', 2, 200), trade('s2', 'SELL', '2026-05-02', 2, 300)];
  const h = computeHoldings(rows, { 'stock-a': 300 }, { asOf: at });
  assert.equal(h[0].sells[0].matchedLots[0].taxType, 'STCG');
  assert.equal(computeCapitalGainsReport(h, { fy: '2026-27' }).grossLtcg, 400);
  const unverified = computeHoldings(rows.map(t => ({ ...t, taxCategory: 'UNKNOWN' })), {}, { asOf: at });
  assert.throws(() => generateSchedule112ACsv(computeCapitalGainsReport(unverified, { fy: '2026-27' })), /verified/);
  assert.equal(computeCapitalGainsReport(h, { fy: 'ALL' }).totalTax, null);
  assert.equal(computeRealizedSummary(h).totalRealized, 600);
});
test('harvesting a newer losing lot consumes the older FIFO winner and reports the actual gain', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-10T06:00:00Z') });
  const rows = [trade('old', 'BUY', '2024-01-01', 10, 100), trade('new', 'BUY', '2026-01-01', 10, 300)];
  const h = computeHoldings(rows, { 'stock-a': 200 }, { asOf: at });
  const report = computeCapitalGainsReport(h, { fy: '2026-27' });
  const auto = simulateTaxHarvesting(h, report, {}, 'LOSS');
  assert.equal(auto.orders.length, 0);
  const newer = simulateTaxHarvesting(h, report, {}, 'GAIN').candidateLots[1];
  const manual = simulateTaxHarvesting(h, report, { [newer.lotKey]: { selected: true, harvestRatio: 1 } }, 'LOSS');
  assert.equal(manual.orders[0].buyDate, '2024-01-01');
  assert.equal(manual.orders.reduce((sum, o) => sum + o.gainOrLoss, 0), 1000);
});
