import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolioId');
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '30'));
    if (!portfolioId) return NextResponse.json({ error: 'portfolioId required' }, { status: 400 });

    const snapshots = await prisma.snapshot.findMany({
      where: { portfolioId },
      orderBy: { snapshotAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ snapshots });
  } catch (e) {
    console.error('GET /api/snapshots:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      portfolioId, totalValue, totalInvested, totalGain,
      totalReturnPct, mfCagr, mfInvested, stInvested, fundCount, stockCount,
    } = body;

    if (!portfolioId || totalValue == null) {
      return NextResponse.json({ error: 'portfolioId and totalValue required' }, { status: 400 });
    }

    // Use current time rounded to nearest minute to avoid duplicate unique constraint
    const snapshotAt = new Date(Math.floor(Date.now() / 60000) * 60000);

    const snapshot = await prisma.snapshot.upsert({
      where: { portfolioId_snapshotAt: { portfolioId, snapshotAt } },
      update: {
        totalValue: parseFloat(totalValue), totalInvested: parseFloat(totalInvested),
        totalGain: parseFloat(totalGain), totalReturnPct: parseFloat(totalReturnPct),
        ...(mfCagr    != null && { mfCagr:    parseFloat(mfCagr) }),
        ...(mfInvested!= null && { mfInvested:parseFloat(mfInvested) }),
        ...(stInvested!= null && { stInvested:parseFloat(stInvested) }),
        ...(fundCount != null && { fundCount: parseInt(fundCount) }),
        ...(stockCount!= null && { stockCount:parseInt(stockCount) }),
      },
      create: {
        portfolioId, snapshotAt,
        totalValue: parseFloat(totalValue), totalInvested: parseFloat(totalInvested),
        totalGain: parseFloat(totalGain), totalReturnPct: parseFloat(totalReturnPct),
        ...(mfCagr    != null && { mfCagr:    parseFloat(mfCagr) }),
        ...(mfInvested!= null && { mfInvested:parseFloat(mfInvested) }),
        ...(stInvested!= null && { stInvested:parseFloat(stInvested) }),
        ...(fundCount != null && { fundCount: parseInt(fundCount) }),
        ...(stockCount!= null && { stockCount:parseInt(stockCount) }),
      },
    });

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (e) {
    console.error('POST /api/snapshots:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
