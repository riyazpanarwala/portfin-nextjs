import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest, conflict } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/instruments/bulk
 * Body: { instruments: [{ symbol, name, isin?, exchange, assetType, sector? }] }
 * Upserts all instruments; returns { created, updated, skipped, errors }
 */
export const POST = withErrorHandler('POST /api/instruments/bulk', async (request) => {
  const { instruments } = await request.json();
  if (!Array.isArray(instruments) || !instruments.length) return badRequest('instruments array required');

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  for (const inst of instruments) {
    const { symbol, name, isin, exchange, assetType, sector } = inst;
    if (!symbol || !exchange || !assetType) { skipped++; continue; }

    try {
      const existing = await prisma.instrument.findFirst({
        where: { symbol: symbol.toUpperCase(), exchange },
      });

      if (existing) {
        await prisma.instrument.update({
          where: { id: existing.id },
          data: {
            name: name || existing.name,
            ...(isin && { isin }),
            ...(sector && { sector }),
          },
        });
        updated++;
      } else {
        await prisma.instrument.create({
          data: {
            symbol: symbol.toUpperCase(),
            name: name || symbol.toUpperCase(),
            exchange,
            assetType,
            isin: isin || null,
            sector: sector || null,
          },
        });
        created++;
      }
    } catch (e) {
      // isin unique constraint — update without isin
      if (e.code === 'P2002' && e.meta?.target?.includes('isin')) {
        try {
          await prisma.instrument.upsert({
            where: { symbol_exchange: { symbol: symbol.toUpperCase(), exchange } },
            update: { name: name || symbol.toUpperCase(), ...(sector && { sector }) },
            create: {
              symbol: symbol.toUpperCase(),
              name: name || symbol.toUpperCase(),
              exchange, assetType,
              sector: sector || null,
            },
          });
          updated++;
        } catch { skipped++; }
      } else {
        errors.push(`${symbol}: ${e.message}`);
        skipped++;
      }
    }
  }

  return NextResponse.json({ created, updated, skipped, errors: errors.slice(0, 10) });
});

/**
 * DELETE /api/instruments/bulk
 * Body: { id } — delete a single instrument (only if no trades reference it)
 */
export const DELETE = withErrorHandler('DELETE /api/instruments/bulk', async (request) => {
  const { id } = await request.json();
  if (!id) return badRequest('id required');

  const tradeCount = await prisma.trade.count({ where: { instrumentId: id } });
  if (tradeCount > 0) return conflict(`Cannot delete — ${tradeCount} trade(s) reference this instrument`);

  await prisma.instrument.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
