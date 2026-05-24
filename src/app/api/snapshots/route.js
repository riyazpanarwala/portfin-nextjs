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
  const limit = parseInt(searchParams.get('limit') || '30');
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
    totalReturnPct, totalRealizedGain,
    mfCagr, stCagr, mfInvested, stInvested, fundCount, stockCount,
  } = body;

  if (!portfolioId || totalValue == null) {
    return badRequest('portfolioId and totalValue required');
  }

  // FIX (Bug 18): round to nearest minute to avoid duplicate constraint on
  // rapid saves.  The `created` flag below now drives the toast message so the
  // user gets "Snapshot saved" vs "Snapshot updated" rather than always seeing
  // "Snapshot saved" even when the existing entry was merely overwritten.
  // The UX note in the UI (SnapshotView) also sets correct expectations.
  const snapshotAt = new Date(Math.floor(Date.now() / 60000) * 60000);

  const sharedData = {
    totalValue:    parseFloat(totalValue),
    totalInvested: parseFloat(totalInvested),
    totalGain:     parseFloat(totalGain),
    totalReturnPct: parseFloat(totalReturnPct),
    ...(totalRealizedGain != null && {
      totalRealizedGain: parseFloat(totalRealizedGain),
    }),
    ...(mfCagr     != null && { mfCagr:     parseFloat(mfCagr) }),
    ...(stCagr     != null && { stCagr:     parseFloat(stCagr) }),
    ...(mfInvested != null && { mfInvested: parseFloat(mfInvested) }),
    ...(stInvested != null && { stInvested: parseFloat(stInvested) }),
    ...(fundCount  != null && { fundCount:  parseIntOrNull(fundCount) }),
    ...(stockCount != null && { stockCount: parseIntOrNull(stockCount) }),
  };

  // Check existence first so we can return an accurate `created` flag.
  // This drives the toast: "📸 Snapshot saved" vs "📸 Snapshot updated (same minute)".
  const existing = await prisma.snapshot.findUnique({
    where: { portfolioId_snapshotAt: { portfolioId, snapshotAt } },
    select: { id: true },
  });

  const snapshot = await prisma.snapshot.upsert({
    where: { portfolioId_snapshotAt: { portfolioId, snapshotAt } },
    update: sharedData,
    create: { portfolioId, snapshotAt, ...sharedData },
  });

  // FIX (Bug 18): include a `duplicateMinute` flag so the client can show a
  // more specific message when the save overwrote an entry from the same minute.
  return NextResponse.json(
    {
      snapshot,
      created: !existing,
      duplicateMinute: !!existing,
    },
    { status: existing ? 200 : 201 }
  );
});
