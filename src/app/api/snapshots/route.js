import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  withErrorHandler,
  badRequest,
  parseFloatOrNull,
  parseIntOrNull,
} from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler('GET /api/snapshots', async (request) => {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '30'));
  if (!portfolioId) return badRequest('portfolioId required');

  const snapshots = await prisma.snapshot.findMany({
    where: { portfolioId },
    orderBy: { snapshotAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ snapshots });
});

export const POST = withErrorHandler('POST /api/snapshots', async (request) => {
  const body = await request.json();
  const {
    portfolioId, totalValue, totalInvested, totalGain,
    totalReturnPct, mfCagr, mfInvested, stInvested, fundCount, stockCount,
  } = body;

  if (!portfolioId || totalValue == null) {
    return badRequest('portfolioId and totalValue required');
  }

  // Round to nearest minute to avoid duplicate unique constraint on rapid saves
  const snapshotAt = new Date(Math.floor(Date.now() / 60000) * 60000);

  const sharedData = {
    totalValue: parseFloat(totalValue),
    totalInvested: parseFloat(totalInvested),
    totalGain: parseFloat(totalGain),
    totalReturnPct: parseFloat(totalReturnPct),
    ...(mfCagr != null && { mfCagr: parseFloat(mfCagr) }),
    ...(mfInvested != null && { mfInvested: parseFloat(mfInvested) }),
    ...(stInvested != null && { stInvested: parseFloat(stInvested) }),
    ...(fundCount != null && { fundCount: parseIntOrNull(fundCount) }),
    ...(stockCount != null && { stockCount: parseIntOrNull(stockCount) }),
  };

  const snapshot = await prisma.snapshot.upsert({
    where: { portfolioId_snapshotAt: { portfolioId, snapshotAt } },
    update: sharedData,
    create: { portfolioId, snapshotAt, ...sharedData },
  });

  return NextResponse.json({ snapshot }, { status: 201 });
});
