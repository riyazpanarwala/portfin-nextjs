import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trades?portfolioId=xxx
 * Returns trades joined with their instrument (symbol, name, sector, assetType, exchange, price)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolioId');
    if (!portfolioId) return NextResponse.json({ error: 'portfolioId required' }, { status: 400 });

    const trades = await prisma.trade.findMany({
      where: { portfolioId },
      include: { instrument: true },
      orderBy: { tradeDate: 'asc' },
    });

    // Flatten for the client — keep same shape the frontend expects
    const flat = trades.map(t => ({
      id:           t.id,
      portfolioId:  t.portfolioId,
      instrumentId: t.instrumentId,
      symbol:       t.instrument.symbol,
      name:         t.instrument.name,
      assetType:    t.instrument.assetType,
      exchange:     t.instrument.exchange,
      sector:       t.instrument.sector || null,
      tradeType:    t.tradeType,
      quantity:     t.quantity.toString(),
      price:        t.price.toString(),
      brokerage:    t.brokerage ? t.brokerage.toString() : null,
      tradeDate:    t.tradeDate.toISOString().slice(0, 10),
      createdAt:    t.createdAt.toISOString(),
    }));

    return NextResponse.json({ trades: flat });
  } catch (e) {
    console.error('GET /api/trades:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/trades
 * Body: { portfolioId, symbol, assetType, exchange?, sector?, tradeType, quantity, price, brokerage?, tradeDate }
 * Automatically upserts the instrument if not found.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      portfolioId, symbol, assetType, tradeType,
      quantity, price, brokerage, tradeDate,
      exchange, sector, name,
    } = body;

    if (!portfolioId || !symbol || !assetType || !tradeType || !quantity || !price || !tradeDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['MF', 'STOCK'].includes(assetType))   return NextResponse.json({ error: 'assetType: MF | STOCK' }, { status: 400 });
    if (!['BUY', 'SELL'].includes(tradeType))   return NextResponse.json({ error: 'tradeType: BUY | SELL' }, { status: 400 });

    const exch = exchange || (assetType === 'MF' ? 'AMFI' : 'NSE');

    // Upsert instrument
    const instrument = await prisma.instrument.upsert({
      where: { symbol_exchange: { symbol: symbol.toUpperCase(), exchange: exch } },
      update: { ...(sector && { sector }), ...(name && { name }) },
      create: {
        symbol:    symbol.toUpperCase(),
        name:      name || symbol.toUpperCase(),
        exchange:  exch,
        assetType,
        sector:    sector || null,
      },
    });

    const trade = await prisma.trade.create({
      data: {
        portfolioId,
        instrumentId: instrument.id,
        tradeType,
        quantity:  parseFloat(quantity),
        price:     parseFloat(price),
        brokerage: brokerage ? parseFloat(brokerage) : null,
        tradeDate: new Date(tradeDate),
      },
      include: { instrument: true },
    });

    return NextResponse.json({
      trade: {
        ...trade,
        symbol:    trade.instrument.symbol,
        name:      trade.instrument.name,
        assetType: trade.instrument.assetType,
        exchange:  trade.instrument.exchange,
        sector:    trade.instrument.sector,
        tradeDate: trade.tradeDate.toISOString().slice(0, 10),
        quantity:  trade.quantity.toString(),
        price:     trade.price.toString(),
      },
    }, { status: 201 });
  } catch (e) {
    console.error('POST /api/trades:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
