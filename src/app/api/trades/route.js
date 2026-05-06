import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  withErrorHandler,
  badRequest,
  parseFloatOrNull,
  flattenTrade,
} from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trades?portfolioId=xxx
 * Returns trades joined with their instrument (symbol, name, sector, assetType, exchange, price)
 */
export const GET = withErrorHandler('GET /api/trades', async (request) => {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');
  if (!portfolioId) return badRequest('portfolioId required');

  const trades = await prisma.trade.findMany({
    where: { portfolioId },
    include: { instrument: true },
    orderBy: { tradeDate: 'asc' },
  });

  return NextResponse.json({ trades: trades.map(flattenTrade) });
});

/**
 * POST /api/trades
 * Body: { portfolioId, symbol, assetType, exchange?, sector?, tradeType, quantity, price, brokerage?, tradeDate }
 * Automatically upserts the instrument if not found.
 */
export const POST = withErrorHandler('POST /api/trades', async (request) => {
  const body = await request.json();
  const {
    portfolioId, symbol, assetType, tradeType,
    quantity, price, brokerage, tradeDate,
    exchange, sector, name,
  } = body;

  if (!portfolioId || !symbol || !assetType || !tradeType || !quantity || !price || !tradeDate) {
    return badRequest('Missing required fields');
  }
  if (!['MF', 'STOCK'].includes(assetType)) return badRequest('assetType: MF | STOCK');
  if (!['BUY', 'SELL'].includes(tradeType)) return badRequest('tradeType: BUY | SELL');

  const exch = exchange || (assetType === 'MF' ? 'AMFI' : 'NSE');

  // Upsert instrument
  const instrument = await prisma.instrument.upsert({
    where: { symbol_exchange: { symbol: symbol.toUpperCase(), exchange: exch } },
    update: { ...(sector && { sector }), ...(name && { name }) },
    create: {
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      exchange: exch,
      assetType,
      sector: sector || null,
    },
  });

  const trade = await prisma.trade.create({
    data: {
      portfolioId,
      instrumentId: instrument.id,
      tradeType,
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      brokerage: parseFloatOrNull(brokerage),
      tradeDate: new Date(tradeDate),
    },
    include: { instrument: true },
  });

  return NextResponse.json({ trade: flattenTrade(trade) }, { status: 201 });
});
