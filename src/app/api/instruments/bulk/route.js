import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest, conflict } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/instruments/bulk?ids=id1,id2,...
 * Returns instruments by a comma-separated list of IDs.
 * Used by the Instrument Manager to refresh rows after an upsert.
 */
export const GET = withErrorHandler('GET /api/instruments/bulk', async (request) => {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!ids.length) return badRequest('ids query param required');

  const instruments = await prisma.instrument.findMany({
    where: { id: { in: ids } },
    orderBy: { symbol: 'asc' },
  });

  return NextResponse.json({ instruments });
});

/**
 * POST /api/instruments/bulk
 * Body: { instruments: Array<{ symbol, name, exchange, assetType, isin?, sector? }> }
 *
 * Upserts each instrument using (symbol, exchange) as the natural key.
 * ISIN uniqueness is handled gracefully — if a different symbol already holds
 * the ISIN, the field is cleared rather than crashing.
 *
 * Returns { created, updated, skipped, errors[] }
 */
export const POST = withErrorHandler('POST /api/instruments/bulk', async (request) => {
  const { instruments } = await request.json();

  if (!Array.isArray(instruments) || instruments.length === 0) {
    return badRequest('instruments array required');
  }

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  for (const inst of instruments) {
    const symbol   = (inst.symbol   || '').trim().toUpperCase();
    const exchange = (inst.exchange || '').trim().toUpperCase();
    const name     = (inst.name     || symbol).trim();
    const assetType = (inst.assetType || 'STOCK').trim().toUpperCase();
    const sector   = inst.sector   ? inst.sector.trim()   : null;
    const isin     = inst.isin     ? inst.isin.trim().toUpperCase() : null;

    if (!symbol || !exchange) {
      skipped++;
      errors.push(`Skipped — missing symbol or exchange: ${JSON.stringify(inst)}`);
      continue;
    }

    if (!['NSE', 'BSE', 'AMFI'].includes(exchange)) {
      skipped++;
      errors.push(`Skipped ${symbol} — unknown exchange "${exchange}"`);
      continue;
    }

    if (!['STOCK', 'MF'].includes(assetType)) {
      skipped++;
      errors.push(`Skipped ${symbol} — unknown assetType "${assetType}"`);
      continue;
    }

    try {
      const existing = await prisma.instrument.findUnique({
        where: { symbol_exchange: { symbol, exchange } },
        select: { id: true },
      });

      // Resolve ISIN conflicts: if another instrument already has this ISIN,
      // clear it from the incoming record rather than violating the unique
      // constraint and aborting the whole batch.
      let safeIsin = isin;
      if (isin) {
        const isinHolder = await prisma.instrument.findUnique({
          where: { isin },
          select: { id: true, symbol: true, exchange: true },
        });
        if (
          isinHolder &&
          !(isinHolder.symbol === symbol && isinHolder.exchange === exchange)
        ) {
          safeIsin = null; // don't overwrite another instrument's ISIN
          errors.push(
            `Note: ISIN ${isin} already belongs to ${isinHolder.symbol}/${isinHolder.exchange} — cleared for ${symbol}`
          );
        }
      }

      const data = {
        name,
        assetType,
        exchange,
        ...(sector    !== null && { sector }),
        ...(safeIsin  !== null && { isin: safeIsin }),
      };

      if (existing) {
        await prisma.instrument.update({
          where: { symbol_exchange: { symbol, exchange } },
          data,
        });
        updated++;
      } else {
        await prisma.instrument.create({
          data: { symbol, exchange, name, assetType, sector, isin: safeIsin },
        });
        created++;
      }
    } catch (err) {
      skipped++;
      errors.push(`Error upserting ${symbol}/${exchange}: ${err.message}`);
    }
  }

  return NextResponse.json({ created, updated, skipped, errors });
});

/**
 * DELETE /api/instruments/bulk
 * Body: { id: string }
 *
 * Deletes a single instrument by its UUID.
 * Blocked if any trades reference it (foreign-key constraint is surfaced as a
 * user-friendly error rather than a raw Prisma crash).
 *
 * FIX (Issue 5): this route was completely missing — the Instrument Manager
 * DELETE button called it and received 404 on every attempt.
 */
export const DELETE = withErrorHandler('DELETE /api/instruments/bulk', async (request) => {
  const { id } = await request.json();

  if (!id) return badRequest('id required');

  // Check for referencing trades BEFORE attempting the delete so we can
  // return a clear error message instead of a raw constraint-violation crash.
  const tradeCount = await prisma.trade.count({
    where: { instrumentId: id },
  });

  if (tradeCount > 0) {
    return conflict(
      `Cannot delete — ${tradeCount} trade${tradeCount !== 1 ? 's' : ''} reference this instrument. ` +
      'Delete those trades first.'
    );
  }

  // Verify the instrument actually exists before deleting
  const instrument = await prisma.instrument.findUnique({
    where: { id },
    select: { id: true, symbol: true, exchange: true },
  });

  if (!instrument) {
    return badRequest(`Instrument with id "${id}" not found`);
  }

  await prisma.instrument.delete({ where: { id } });

  return NextResponse.json({
    success: true,
    deleted: { id, symbol: instrument.symbol, exchange: instrument.exchange },
  });
});
