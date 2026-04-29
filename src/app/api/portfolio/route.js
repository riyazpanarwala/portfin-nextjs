import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: {
        _count: { select: { trades: true } },
        snapshots: { orderBy: { snapshotAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ portfolios });
  } catch (e) {
    console.error('GET /api/portfolio:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, name } = await request.json();
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@portfin.app`, displayName: 'Portfolio Owner' },
    });

    const portfolio = await prisma.portfolio.create({
      data: { userId, name: name || 'My Portfolio' },
    });

    return NextResponse.json({ portfolio }, { status: 201 });
  } catch (e) {
    console.error('POST /api/portfolio:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
