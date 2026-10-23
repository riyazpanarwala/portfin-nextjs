import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';
import { bootstrapPortfolio } from '@/lib/portfolioBootstrap';

export const dynamic = 'force-dynamic';

// POST also supports creating the default portfolio on a user's first load.
export const POST = withErrorHandler('POST /api/portfolio/bootstrap', async (request, { session }) => {
  let input;
  try { input = await request.json(); } catch { return badRequest('Invalid bootstrap request'); }
  return NextResponse.json(await bootstrapPortfolio(prisma, session, input));
});
