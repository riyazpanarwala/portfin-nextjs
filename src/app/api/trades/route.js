import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest, flattenTrade } from '@/lib/apiHelpers';
import { requireOwnedPortfolio, HttpError } from '@/lib/auth';
import { tradeOrder, dateOnly, decimalInput, lockPortfolio, reviseLedger } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler('GET /api/trades', async (request, { session }) => {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');
  await requireOwnedPortfolio(portfolioId, session);
  const limit = Number(searchParams.get('limit') || 1000);
  const offset = Number(searchParams.get('offset') || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0) return badRequest('Invalid pagination');
  const result = await prisma.$transaction(async db => {
    await lockPortfolio(db, portfolioId, session.userId);
    const portfolio = await db.portfolio.findUnique({ where: { id: portfolioId } });
    const expectedRevision = searchParams.get('revision');
    if (expectedRevision !== null && Number(expectedRevision) !== portfolio.revision) throw new HttpError(409, 'Portfolio changed during loading. Reload the history.');
    const [trades, total, actions] = await Promise.all([
      db.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder, take: limit, skip: offset }),
      db.trade.count({ where: { portfolioId } }),
      db.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] }),
    ]);
    return { trades: trades.map(flattenTrade), total, revision: portfolio.revision, hasMore: offset + trades.length < total, corporateActions: actions };
  });
  return NextResponse.json(result);
});

export const POST = withErrorHandler('POST /api/trades', async (request, { session }) => {
  const body = await request.json();
  const { portfolioId, symbol, assetType, tradeType, name, sector, isin } = body;
  await requireOwnedPortfolio(portfolioId, session);
  if (typeof symbol !== 'string' || !/^[A-Za-z0-9._&-]{1,40}$/.test(symbol) || !['MF', 'STOCK'].includes(assetType) || !['BUY', 'SELL'].includes(tradeType)) return badRequest('Invalid trade identity or type');
  const exchange = body.exchange || (assetType === 'MF' ? 'AMFI' : 'NSE');
  if (!['NSE', 'BSE', 'AMFI'].includes(exchange) || (assetType === 'MF') !== (exchange === 'AMFI')) return badRequest('Invalid exchange for asset type');
  const tradeDate = dateOnly(body.tradeDate);
  const quantity = decimalInput(body.quantity, { scale: 6 });
  const price = decimalInput(body.price);
  const brokerage = decimalInput(body.brokerage, { zero: true, optional: true });
  const taxBrokerage = decimalInput(body.taxBrokerage, { zero: true, optional: true });
  if (taxBrokerage != null && Number(taxBrokerage) > Number(brokerage || 0)) return badRequest('Tax-deductible charges cannot exceed total charges');
  if (isin && (typeof isin !== 'string' || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin))) return badRequest('Invalid ISIN');
  if (name != null && (typeof name !== 'string' || name.length > 250)) return badRequest('Invalid name');
  if (sector != null && (typeof sector !== 'string' || sector.length > 100)) return badRequest('Invalid sector');
  const trade = await prisma.$transaction(async db => {
    await lockPortfolio(db, portfolioId, session.userId);
    const instrument = await db.instrument.upsert({
      where: { symbol_exchange: { symbol: symbol.toUpperCase(), exchange } }, update: {},
      create: { symbol: symbol.toUpperCase(), name: name || symbol.toUpperCase(), exchange, assetType, sector: sector || null, isin: isin || null },
    });
    if (instrument.assetType !== assetType) throw new HttpError(400, 'Instrument asset type mismatch');
    const saved = await db.trade.create({ data: { portfolioId, instrumentId: instrument.id, tradeType, quantity, price, brokerage, taxBrokerage, tradeDate: new Date(tradeDate) }, include: { instrument: true } });
    await reviseLedger(db, portfolioId, tradeDate);
    return saved;
  });
  return NextResponse.json({ trade: flattenTrade(trade) }, { status: 201 });
});
