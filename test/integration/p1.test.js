import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { saveTradeOnce } from '../../src/lib/tradeSubmission.js';
import { consumeLoginBuckets, LOGIN_WINDOW_MS } from '../../src/lib/loginRateLimit.js';

// Explicitly opt in. All fixtures live in a newly created, disposable schema.
const databaseUrl = process.env.PORTFIN_TEST_DATABASE_URL;
test('PostgreSQL: concurrent trade retries, rollback, isolation and shared login limits', { skip: !databaseUrl }, async t => {
  const schema = `portfin_test_${randomBytes(8).toString('hex')}`;
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', 'public');
  const admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  url.searchParams.set('schema', schema);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    const baseline = readFileSync(new URL('../../prisma/migrations/20261010000000_baseline/migration.sql', import.meta.url), 'utf8');
    for (const type of ['Exchange', 'AssetType', 'TradeType']) {
      const statement = baseline.match(new RegExp(`CREATE TYPE "${type}" AS ENUM \\([\\s\\S]*?\\);`))?.[0];
      assert.ok(statement, `Baseline contains ${type}`);
      await admin.$executeRawUnsafe(statement.replace(`CREATE TYPE "${type}"`, `CREATE TYPE "${schema}"."${type}"`));
    }
    for (const table of ['users', 'portfolios', 'instruments', 'trades', 'snapshots']) {
      await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE "public"."${table}" INCLUDING ALL)`);
    }
    for (const [table, column, type] of [['instruments', 'exchange', 'Exchange'], ['instruments', 'asset_type', 'AssetType'], ['trades', 'trade_type', 'TradeType']]) {
      await admin.$executeRawUnsafe(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" TYPE "${schema}"."${type}" USING "${column}"::text::"${schema}"."${type}"`);
    }
    const migration = readFileSync(new URL('../../prisma/migrations/20261010000200_trade_retries_login_limits/migration.sql', import.meta.url), 'utf8');
    for (const table of ['trade_submissions', 'login_rate_limits']) {
      const statement = migration.match(new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`))?.[0];
      assert.ok(statement, `Migration contains ${table}`);
      const scoped = statement.replace(`CREATE TABLE "${table}"`, `CREATE TABLE "${schema}"."${table}"`)
        .replace(/REFERENCES "(portfolios|trades)"/g, `REFERENCES "${schema}"."$1"`);
      await admin.$executeRawUnsafe(scoped);
    }
    const user = await db.user.create({ data: { id: randomUUID(), email: 'fixture@example.test' } });
    const portfolio = await db.portfolio.create({ data: { id: randomUUID(), userId: user.id } });
    const session = { userId: user.id };
    const input = { portfolioId: portfolio.id, symbol: 'FIXTURE', exchange: 'NSE', assetType: 'STOCK', tradeType: 'BUY', quantity: '10', price: '100', brokerage: null, taxBrokerage: null, tradeDate: '2026-10-01' };
    const key = randomUUID();

    await t.test('eight concurrent identical requests create one trade and increment the revision once', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => saveTradeOnce(db, session, input, key)));
      assert.equal(new Set(results.map(result => result.trade.id)).size, 1);
      assert.equal(results.filter(result => !result.replayed).length, 1);
      assert.equal(await db.trade.count(), 1);
      assert.equal(await db.tradeSubmission.count(), 1);
      assert.equal((await db.portfolio.findUnique({ where: { id: portfolio.id } })).revision, 1);
    });
    await t.test('a fresh key allows an identical legitimate trade, and keys are scoped to portfolios', async () => {
      await saveTradeOnce(db, session, input, randomUUID());
      const other = await db.portfolio.create({ data: { id: randomUUID(), userId: user.id } });
      await saveTradeOnce(db, session, { ...input, portfolioId: other.id }, key);
      assert.equal(await db.trade.count(), 3);
    });
    await t.test('changed payloads and other users cannot reuse a submission', async () => {
      await assert.rejects(saveTradeOnce(db, session, { ...input, price: '101' }, key), e => e.status === 409);
      await assert.rejects(saveTradeOnce(db, { userId: randomUUID() }, input, key), e => e.status === 404);
      assert.equal(await db.trade.count(), 3);
    });
    await t.test('deleting a trade preserves a tombstone and a retry cannot resurrect it', async () => {
      const submission = await db.tradeSubmission.findUnique({ where: { portfolioId_key: { portfolioId: portfolio.id, key } } });
      await db.trade.delete({ where: { id: submission.tradeId } });
      assert.equal((await db.tradeSubmission.findUnique({ where: { portfolioId_key: { portfolioId: portfolio.id, key } } })).tradeId, null);
      await assert.rejects(saveTradeOnce(db, session, input, key), e => e.status === 409);
      assert.equal(await db.trade.count(), 2);
    });
    await t.test('a transaction failure rolls back the trade, key and portfolio revision', async () => {
      const revision = (await db.portfolio.findUnique({ where: { id: portfolio.id } })).revision;
      const failingDb = { $transaction: callback => db.$transaction(tx => callback({ ...tx, snapshot: { updateMany: async () => { throw new Error('Injected snapshot failure'); } } })) };
      const failedKey = randomUUID();
      await assert.rejects(saveTradeOnce(failingDb, session, input, failedKey), /Injected snapshot failure/);
      assert.equal(await db.trade.count(), 2);
      assert.equal(await db.tradeSubmission.findUnique({ where: { portfolioId_key: { portfolioId: portfolio.id, key: failedKey } } }), null);
      assert.equal((await db.portfolio.findUnique({ where: { id: portfolio.id } })).revision, revision);
      assert.equal((await saveTradeOnce(db, session, input, failedKey)).replayed, false);
    });
    // Scope raw SQL explicitly too, so this test never touches live rate-limit records.
    const rateDb = { $queryRaw: query => {
      query.strings[0] = query.strings[0].replace('INSERT INTO "login_rate_limits"', `INSERT INTO "${schema}"."login_rate_limits"`);
      return db.$queryRaw(query);
    } };
    const bucket = { key: createHash('sha256').update(randomUUID()).digest('hex'), limit: 5 };
    const now = new Date('2026-10-10T00:00:00Z');
    await t.test('concurrent login attempts reserve exactly five allowances across callers', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => consumeLoginBuckets([bucket], rateDb, now)));
      assert.equal(results.filter(result => result.allowed).length, 5);
      assert.equal(results.filter(result => !result.allowed).length, 7);
      assert.equal((await db.loginRateLimit.findUnique({ where: { key: bucket.key } })).attempts, 12);
      assert.ok(results.filter(result => !result.allowed).every(result => result.retryAfter === 900));
    });
    await t.test('the full window resets the allowance and blocked requests cannot extend it', async () => {
      const before = await consumeLoginBuckets([bucket], rateDb, new Date(now.getTime() + LOGIN_WINDOW_MS - 1));
      assert.deepEqual(before, { allowed: false, retryAfter: 1 });
      assert.deepEqual(await consumeLoginBuckets([bucket], rateDb, new Date(now.getTime() + LOGIN_WINDOW_MS)), { allowed: true, retryAfter: 0 });
      assert.equal((await db.loginRateLimit.findUnique({ where: { key: bucket.key } })).attempts, 1);
    });
  } finally {
    await db.$disconnect();
    // Generated internally above; never drop a caller-supplied schema.
    if (created && /^portfin_test_[a-f0-9]{16}$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
