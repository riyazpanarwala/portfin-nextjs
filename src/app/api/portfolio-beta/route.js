import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiHelpers';
import { collectPortfolioBeta } from '@/lib/portfolioBetaService';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler('POST /api/portfolio-beta', async request => {
  const { holdings = [] } = await request.json();
  return NextResponse.json(await collectPortfolioBeta(holdings));
});
