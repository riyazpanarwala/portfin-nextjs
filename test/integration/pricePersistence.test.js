import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, Prisma } from '@prisma/client';
import { persistInstrumentPrices } from '../../src/lib/pricePersistence.js';

// Only use a session-local temporary table; never update catalogue records.
const databaseUrl = process.env.PORTFIN_TEST_DATABASE_URL;
test('PostgreSQL: batch price precision, dates, missing records and atomic rollback', { skip: !databaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  const asOf = new Date('2026-10-23');
  const updatedAt = new Date('2026-10-24T06:07:08.123Z');
  const updates = [
    { id: 'stock', price: 123.4567, priceAsOf: asOf, priceUpdatedAt: updatedAt, priceSource: 'yahoo' },
    { id: 'fund', price: 0.0001, priceAsOf: asOf, priceUpdatedAt: updatedAt, priceSource: 'amfi' },
  ];
  try {
    await db.$transaction(async tx => {
      await tx.$executeRaw`CREATE TEMP TABLE "instruments" (
        "id" text PRIMARY KEY, "price" numeric(12,4), "price_as_of" date,
        "price_updated_at" timestamp(3), "price_source" text
      ) ON COMMIT DROP`;
      const [relation] = await tx.$queryRaw`SELECT n.nspname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = to_regclass('instruments')`;
      assert.match(relation.name, /^pg_temp_/);
      await tx.$executeRaw`INSERT INTO "instruments" ("id", "price") VALUES ('stock', 1), ('fund', 2)`;
      // Non-UTC session checks ensure publication dates and UTC timestamps do not shift.
      await tx.$executeRaw`SET LOCAL TIME ZONE 'America/Los_Angeles'`;
      const adapter = { $transaction: async run => {
        await tx.$executeRaw`SAVEPOINT price_batch`;
        try { const result = await run(tx); await tx.$executeRaw`RELEASE SAVEPOINT price_batch`; return result; }
        catch (error) { await tx.$executeRaw`ROLLBACK TO SAVEPOINT price_batch`; await tx.$executeRaw`RELEASE SAVEPOINT price_batch`; throw error; }
      } };
      await persistInstrumentPrices(adapter, updates);
      const saved = await tx.$queryRaw`SELECT "id", "price"::text AS price, "price_as_of"::text AS day, "price_updated_at"::text AS updated, "price_source" AS source FROM "instruments" ORDER BY "id"`;
      assert.deepEqual(saved, [
        { id: 'fund', price: '0.0001', day: '2026-10-23', updated: '2026-10-24 06:07:08.123', source: 'amfi' },
        { id: 'stock', price: '123.4567', day: '2026-10-23', updated: '2026-10-24 06:07:08.123', source: 'yahoo' },
      ]);
      await assert.rejects(persistInstrumentPrices(adapter, [{ ...updates[0], price: 999 }, { ...updates[1], id: 'missing' }]), /no longer exists/);
      await assert.rejects(persistInstrumentPrices(adapter, [{ ...updates[0], price: 999 }, { ...updates[1], price: 1e20 }]));
      assert.deepEqual(await tx.$queryRaw`SELECT "id", "price"::text AS price FROM "instruments" ORDER BY "id"`, [{ id: 'fund', price: '0.0001' }, { id: 'stock', price: '123.4567' }]);

      // A failure in a later SQL chunk must also undo the earlier chunk.
      const large = Array.from({ length: 101 }, (_, i) => ({ ...updates[0], id: `batch-${i}`, price: i + 10 }));
      await tx.$executeRaw(Prisma.sql`INSERT INTO "instruments" ("id", "price") VALUES ${Prisma.join(large.slice(0, 100).map(row => Prisma.sql`(${row.id}, 1)`))}`);
      await assert.rejects(persistInstrumentPrices(adapter, large), /no longer exists/);
      const [unchanged] = await tx.$queryRaw`SELECT count(*)::int AS count FROM "instruments" WHERE "id" LIKE 'batch-%' AND "price" = 1`;
      assert.equal(unchanged.count, 100);
    }, { timeout: 30000 });
  } finally { await db.$disconnect(); }
});
