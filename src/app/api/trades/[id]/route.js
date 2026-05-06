import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, parseFloatOrNull, flattenTrade } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler('DELETE /api/trades/[id]', async (request, { params }) => {
  const { id } = await params;
  await prisma.trade.delete({ where: { id } });
  return NextResponse.json({ success: true });
});

export const PATCH = withErrorHandler('PATCH /api/trades/[id]', async (request, { params }) => {
  const { id } = await params;
  const { tradeType, quantity, price, brokerage, tradeDate } = await request.json();

  const trade = await prisma.trade.update({
    where: { id },
    data: {
      ...(tradeType && { tradeType }),
      ...(quantity && { quantity: parseFloat(quantity) }),
      ...(price && { price: parseFloat(price) }),
      // brokerage can be explicitly set to null to clear it
      ...(brokerage !== undefined && { brokerage: parseFloatOrNull(brokerage) }),
      ...(tradeDate && { tradeDate: new Date(tradeDate) }),
    },
    include: { instrument: true },
  });

  return NextResponse.json({ trade: flattenTrade(trade) });
});
