import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler('GET /api/portfolio', async (request) => {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) return badRequest('userId required');

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

export const POST = withErrorHandler('POST /api/portfolio', async (request) => {
  const { userId, name } = await request.json();
  if (!userId) return badRequest('userId required');

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@portfin.app`, displayName: 'Portfolio Owner' },
  });

  const portfolio = await prisma.portfolio.create({
    data: { userId, name: name || 'My Portfolio' },
  });

  return NextResponse.json({ portfolio }, { status: 201 });
});
