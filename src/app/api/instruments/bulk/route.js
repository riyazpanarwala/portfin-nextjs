import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/instruments/bulk
 * Body: { instruments: [{ symbol, name, isin?, exchange, assetType, sector? }] }
 * Upserts all instruments; returns { created, updated, skipped, errors }
 */
export async function POST(request) {
  try {
    const { instruments } = await request.json();
    if (!Array.isArray(instruments) || !instruments.length) {
      return NextResponse.json({ error: 'instruments array required' }, { status: 400 });
    }

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
  } catch (e) {
    console.error('POST /api/instruments/bulk:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/instruments/bulk
 * Body: { id } — delete a single instrument (only if no trades reference it)
 */
export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const tradeCount = await prisma.trade.count({ where: { instrumentId: id } });
    if (tradeCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${tradeCount} trade(s) reference this instrument` },
        { status: 409 }
      );
    }

    await prisma.instrument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
