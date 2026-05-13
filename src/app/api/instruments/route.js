import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/instruments?q=INFY&assetType=STOCK&limit=10&offset=0
 * Search instruments by symbol or name prefix, with working pagination.
 *
 * FIX (high): the `offset` query param was read by useInstrumentTable but
 * never consumed by this handler — every "page" returned the same first N rows.
 * Added `skip: offset` to the Prisma query so pagination works correctly.
 */
export const GET = withErrorHandler('GET /api/instruments', async (request) => {
  const { searchParams } = new URL(request.url);
  const q         = searchParams.get('q')?.trim() || '';
  const assetType = searchParams.get('assetType');
  const limit     = Math.min(20, parseInt(searchParams.get('limit')  || '10'));
  // FIX: read offset so the instrument browser pages correctly
  const offset    = Math.max(0,  parseInt(searchParams.get('offset') || '0'));

  if (q.length < 1) return NextResponse.json({ instruments: [] });

  const instruments = await prisma.instrument.findMany({
    where: {
      ...(assetType && { assetType }),
      OR: [
        { symbol: { contains: q.toUpperCase() } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ symbol: 'asc' }],
    take:   limit,
    skip:   offset,   // FIX: was missing — caused every page to show the same results
    select: {
      id: true, symbol: true, name: true,
      assetType: true, exchange: true, sector: true,
      price: true, priceUpdatedAt: true,
    },
  });

  return NextResponse.json({ instruments });
});
