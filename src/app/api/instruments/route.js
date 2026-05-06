import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/instruments?q=INFY&assetType=STOCK&limit=10
 * Search instruments by symbol or name prefix
 */
export const GET = withErrorHandler('GET /api/instruments', async (request) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() || '';
  const assetType = searchParams.get('assetType');
  const limit = Math.min(20, parseInt(searchParams.get('limit') || '10'));

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
    take: limit,
    select: { id: true, symbol: true, name: true, assetType: true, exchange: true, sector: true, price: true, priceUpdatedAt: true },
  });

  return NextResponse.json({ instruments });
});
