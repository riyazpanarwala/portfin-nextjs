import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHelpers';
import { confirmSaleTaxEligibility } from '@/lib/saleTaxConfirmation';

export const POST = withErrorHandler('POST /api/trades/tax-eligibility', async (request, { session }) => {
  const result = await confirmSaleTaxEligibility(prisma, session, await request.json());
  return NextResponse.json(result);
});
