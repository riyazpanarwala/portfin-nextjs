import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiHelpers';
import { collectFundamentals } from '@/lib/fundamentalsService';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler('POST /api/fundamentals', async request => {
  const { holdings = [], force = false } = await request.json();
  return NextResponse.json(await collectFundamentals(holdings, { force }));
});
