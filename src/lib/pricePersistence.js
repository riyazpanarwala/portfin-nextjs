import { Prisma } from '@prisma/client';

const WRITE_BATCH_SIZE = 100;

export async function persistInstrumentPrices(db, updates) {
  const rows = [...new Map(updates.map(update => [update.id, update])).values()];
  if (!rows.length) return;
  // A single instrument already needs only one round trip.
  if (rows.length === 1) {
    const { id, ...data } = rows[0];
    await db.instrument.update({ where: { id }, data });
    return;
  }
  await db.$transaction(async tx => {
    for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + WRITE_BATCH_SIZE);
      const values = batch.map(row => Prisma.sql`(
        ${row.id}::text, ${String(row.price)}::numeric, ${row.priceAsOf.toISOString().slice(0, 10)}::date,
        ${row.priceUpdatedAt.toISOString()}::timestamp, ${row.priceSource}::text
      )`);
      const count = await tx.$executeRaw(Prisma.sql`
        UPDATE "instruments" AS instrument
        SET "price" = incoming."price",
            "price_as_of" = incoming."price_as_of",
            "price_updated_at" = incoming."price_updated_at",
            "price_source" = incoming."price_source"
        FROM (VALUES ${Prisma.join(values)})
          AS incoming("id", "price", "price_as_of", "price_updated_at", "price_source")
        WHERE instrument."id" = incoming."id"
      `);
      // Match Prisma update's missing-record failure, without leaving a partial refresh committed.
      if (count !== batch.length) throw new Error('Price update failed: an instrument no longer exists.');
    }
  }, { timeout: 20000 });
}
