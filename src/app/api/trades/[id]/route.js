import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, flattenTrade } from '@/lib/apiHelpers';
import { HttpError } from '@/lib/auth';
import { decimalInput, dateOnly, lockPortfolio, reviseLedger } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

async function mutate(request, { params, session }, remove) {
  const { id } = await params;
  const body = remove ? {} : await request.json();
  const result = await prisma.$transaction(async db => {
    const target = await db.trade.findFirst({ where: { id, portfolio: { userId: session.userId } } });
    if (!target) throw new HttpError(404, 'Trade not found');
    await lockPortfolio(db, target.portfolioId, session.userId);
    const existing = await db.trade.findFirst({ where: { id, portfolio: { userId: session.userId } } });
    if (!existing) throw new HttpError(404, 'Trade not found');
    if (remove) {
      await db.trade.delete({ where: { id } });
      await reviseLedger(db, existing.portfolioId, existing.tradeDate.toISOString().slice(0, 10));
      return null;
    }
    const data = {};
    if (body.tradeType !== undefined) {
      if (!['BUY', 'SELL'].includes(body.tradeType)) throw new HttpError(400, 'Invalid trade type');
      data.tradeType = body.tradeType;
    }
    if (body.quantity !== undefined) data.quantity = decimalInput(body.quantity, { scale: 6 });
    if (body.price !== undefined) data.price = decimalInput(body.price);
    for (const field of ['brokerage', 'taxBrokerage']) if (body[field] !== undefined) data[field] = decimalInput(body[field], { zero: true, optional: true });
    const economicFee = data.brokerage === undefined ? existing.brokerage || 0 : data.brokerage || 0;
    const taxFee = data.taxBrokerage === undefined ? existing.taxBrokerage || 0 : data.taxBrokerage || 0;
    if (Number(taxFee) > Number(economicFee)) throw new HttpError(400, 'Tax-deductible charges cannot exceed total charges');
    if (body.tradeDate !== undefined) data.tradeDate = new Date(dateOnly(body.tradeDate));
    const trade = await db.trade.update({ where: { id }, data, include: { instrument: true } });
    const earliest = data.tradeDate && data.tradeDate < existing.tradeDate ? data.tradeDate : existing.tradeDate;
    await reviseLedger(db, existing.portfolioId, earliest.toISOString().slice(0, 10));
    return flattenTrade(trade);
  });
  return NextResponse.json(remove ? { success: true } : { trade: result });
}

export const DELETE = withErrorHandler('DELETE /api/trades/[id]', (request, context) => mutate(request, context, true));
export const PATCH = withErrorHandler('PATCH /api/trades/[id]', (request, context) => mutate(request, context, false));
