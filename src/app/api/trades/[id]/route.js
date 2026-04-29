import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await prisma.trade.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/trades/[id]:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { tradeType, quantity, price, brokerage, tradeDate } = body;

    const trade = await prisma.trade.update({
      where: { id },
      data: {
        ...(tradeType  && { tradeType }),
        ...(quantity   && { quantity:  parseFloat(quantity) }),
        ...(price      && { price:     parseFloat(price) }),
        ...(brokerage !== undefined && { brokerage: brokerage ? parseFloat(brokerage) : null }),
        ...(tradeDate  && { tradeDate: new Date(tradeDate) }),
      },
      include: { instrument: true },
    });

    return NextResponse.json({
      trade: {
        ...trade,
        symbol:    trade.instrument.symbol,
        assetType: trade.instrument.assetType,
        sector:    trade.instrument.sector,
        tradeDate: trade.tradeDate.toISOString().slice(0, 10),
        quantity:  trade.quantity.toString(),
        price:     trade.price.toString(),
      },
    });
  } catch (e) {
    console.error('PATCH /api/trades/[id]:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
