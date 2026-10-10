import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from '../../src/lib/passwordHash.js';
import { authenticatePassword } from '../../src/lib/passwordLogin.js';
import { loginBuckets, consumeLoginBuckets } from '../../src/lib/loginRateLimit.js';
import { tradeRequestHash, validateSubmissionKey, saveTradeOnce } from '../../src/lib/tradeSubmission.js';

test('asynchronous verification preserves existing PBKDF2 hashes and rejects wrong or malformed credentials', async () => {
  const password = 'test-only-password';
  const stored = hashPassword(password);
  const pending = verifyPassword(password, stored);
  assert.ok(pending instanceof Promise);
  assert.equal(await pending, true);
  assert.equal(await verifyPassword('wrong', stored), false);
  for (const hash of [null, '', stored.replace('$310000$', '$999999999$'), stored + '$extra', 'broken']) {
    assert.equal(await verifyPassword(password, hash), false);
  }
});

test('a throttled login performs no user lookup or password work', async () => {
  const result = await authenticatePassword(new Request('https://portfin.test'), ' OWNER@example.com ', 'password', {
    db: { user: { findUnique: async () => { throw new Error('Must not query'); } } },
    consumeAttempt: async email => { assert.equal(email, 'owner@example.com'); return { allowed: false, retryAfter: 900 }; },
    verify: async () => { throw new Error('Must not derive'); },
  });
  assert.deepEqual(result, { user: null, retryAfter: 900 });
});

test('unknown users perform dummy verification and cannot authenticate even if the dummy matches', async () => {
  let verifiedHash;
  const result = await authenticatePassword(new Request('https://portfin.test'), 'missing@example.com', 'password', {
    db: { user: { findUnique: async () => null } }, consumeAttempt: async () => ({ allowed: true }),
    verify: async (_password, hash) => { verifiedHash = hash; return true; },
  });
  assert.equal(verifiedHash, DUMMY_PASSWORD_HASH);
  assert.deepEqual(result, { user: null, retryAfter: 0 });
});

test('successful and failed known-user logins both consume a reservation before verification', async () => {
  const user = { id: 'owner', email: 'owner@example.com', passwordHash: 'stored' };
  for (const verified of [true, false]) {
    const events = [];
    const result = await authenticatePassword(new Request('https://portfin.test'), ' Owner@example.com ', 'password', {
      consumeAttempt: async () => { events.push('reserve'); return { allowed: true }; },
      db: { user: { findUnique: async query => { events.push('lookup'); assert.equal(query.where.email, user.email); return user; } } },
      verify: async () => { events.push('verify'); return verified; },
    });
    assert.deepEqual(events, ['reserve', 'lookup', 'verify']);
    assert.equal(result.user, verified ? user : null);
  }
});

test('spoofed forwarding headers cannot change the default source bucket; account case is normalized', () => {
  const first = new Request('https://portfin.test', { headers: { 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '1.1.1.1' } });
  const second = new Request('https://portfin.test', { headers: { 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '2.2.2.2' } });
  assert.deepEqual(loginBuckets(' Owner@example.com ', first, ''), loginBuckets('owner@example.com', second, ''));
  assert.notDeepEqual(loginBuckets('owner@example.com', first, 'x-real-ip'), loginBuckets('owner@example.com', second, 'x-real-ip'));
  assert.deepEqual(loginBuckets('owner@example.com', first, 'x-forwarded-for'), loginBuckets('owner@example.com', first, ''));
  for (const bucket of loginBuckets('owner@example.com', first, '')) assert.match(bucket.key, /^[a-f0-9]{64}$/);
});

test('login limits allow the boundary attempt and return a bounded Retry-After when either bucket blocks', async () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const buckets = [{ key: 'account', limit: 5 }, { key: 'ip', limit: 30 }];
  for (const [account, ip, allowed] of [[5, 30, true], [6, 1, false], [1, 31, false]]) {
    const db = { $queryRaw: async () => [{ key: 'account', attempts: account, expiresAt: new Date(now.getTime() + 1500) }, { key: 'ip', attempts: ip, expiresAt: new Date(now.getTime() + 1500) }] };
    assert.deepEqual(await consumeLoginBuckets(buckets, db, now), { allowed, retryAfter: allowed ? 0 : 2 });
  }
  await assert.rejects(consumeLoginBuckets(buckets, { $queryRaw: async () => { throw new Error('DB unavailable'); } }, now), /DB unavailable/);
});

const input = { portfolioId: 'portfolio', symbol: 'TEST', exchange: 'NSE', assetType: 'STOCK', tradeType: 'BUY', quantity: '1.00', price: '123.4500', brokerage: null, taxBrokerage: null, tradeDate: '2026-10-01' };
test('submission keys reject missing/invalid values and fingerprints normalize decimal representations', () => {
  for (const key of [null, '', 'short', 'a'.repeat(129), 'a'.repeat(20) + "'"]) assert.throws(() => validateSubmissionKey(key), e => e.status === 400);
  assert.equal(validateSubmissionKey('test-submission-key'), 'test-submission-key');
  assert.equal(tradeRequestHash(input), tradeRequestHash({ ...input, quantity: '1', price: '123.45', symbol: 'test' }));
  for (const change of [{ quantity: '2' }, { portfolioId: 'other' }, { exchange: 'BSE' }, { taxBrokerage: '1' }]) assert.notEqual(tradeRequestHash(input), tradeRequestHash({ ...input, ...change }));
});

test('replays return the existing trade without a second write or revision bump, and changed/deleted submissions conflict', async () => {
  const trade = { id: 'saved-trade' };
  for (const [record, expected] of [[{ requestHash: tradeRequestHash(input), trade }, trade], [{ requestHash: 'other', trade }, 409], [{ requestHash: tradeRequestHash(input), trade: null }, 409]]) {
    const tx = { portfolio: { updateMany: async () => ({ count: 1 }) }, tradeSubmission: { findUnique: async () => record } };
    const db = { $transaction: async callback => callback(tx) };
    if (expected === 409) await assert.rejects(saveTradeOnce(db, { userId: 'owner' }, input, 'test-submission-key'), e => e.status === 409);
    else assert.deepEqual(await saveTradeOnce(db, { userId: 'owner' }, input, 'test-submission-key'), { trade, replayed: true });
  }
  const db = { $transaction: async callback => callback({ portfolio: { updateMany: async () => ({ count: 0 }) } }) };
  await assert.rejects(saveTradeOnce(db, { userId: 'other' }, input, 'test-submission-key'), e => e.status === 404);
});
