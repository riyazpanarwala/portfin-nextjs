import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler('GET /api/portfolio', async (request, { session }) => {
  const userId = session.userId;

  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    include: {
      _count: { select: { trades: true } },
      snapshots: { orderBy: { snapshotAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ portfolios });
});

export const POST = withErrorHandler('POST /api/portfolio', async (request, { session }) => {
  const { name } = await request.json();
  const userId = session.userId;
  if (name != null && (typeof name !== 'string' || name.length > 100)) return badRequest('Invalid portfolio name');

  const portfolio = await prisma.portfolio.create({
    data: { userId, name: name || 'My Portfolio' },
  });

  return NextResponse.json({ portfolio }, { status: 201 });
});
