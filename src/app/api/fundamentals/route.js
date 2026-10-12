import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiHelpers';
import { collectFundamentals } from '@/lib/fundamentalsService';
import { readAnalyticsRequest } from '@/lib/analyticsHoldings';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler('POST /api/fundamentals', async request => {
  const { holdings, force } = await readAnalyticsRequest(request);
  return NextResponse.json(await collectFundamentals(holdings, { force }));
});
