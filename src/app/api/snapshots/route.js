import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest, flattenTrade } from '@/lib/apiHelpers';
import { requireOwnedPortfolio, HttpError } from '@/lib/auth';
import { lockPortfolio, tradeOrder } from '@/lib/ledger';
import { dayKey } from '@/lib/financialRules';
import { buildSnapshotData, cachedValuationInputs, snapshotWithStockReturn } from '@/lib/snapshotValuation';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler('GET /api/snapshots', async (request, { session }) => {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');
  await requireOwnedPortfolio(portfolioId, session);
  const limit = Number(searchParams.get('limit') || 30);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return badRequest('Invalid limit');
  const snapshots = await prisma.$transaction(async db => {
    const saved = await db.snapshot.findMany({ where: { portfolioId }, orderBy: { snapshotAt: 'desc' }, take: limit });
    const trades = await db.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder });
    const actions = await db.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
    const flattened = trades.map(flattenTrade);
    return saved.map(snapshot => snapshotWithStockReturn(snapshot, flattened, actions));
  }, { isolationLevel: 'RepeatableRead', timeout: 20000 });
  return NextResponse.json({ snapshots });
});

export const POST = withErrorHandler('POST /api/snapshots', async (request, { session }) => {
  const { portfolioId } = await request.json();
  await requireOwnedPortfolio(portfolioId, session);
  const snapshotAt = new Date(Math.floor(Date.now() / 60000) * 60000);
  const result = await prisma.$transaction(async db => {
    await lockPortfolio(db, portfolioId, session.userId);
    const portfolio = await db.portfolio.findUnique({ where: { id: portfolioId } });
    const rawTrades = await db.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder });
    const actions = await db.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
    const instruments = [...new Map(rawTrades.map(t => [t.instrumentId, t.instrument])).values()];
    const { prices, meta } = cachedValuationInputs(instruments);
    let data;
    try { data = buildSnapshotData(rawTrades.map(flattenTrade), prices, meta, { asOf: dayKey(new Date()), corporateActions: actions, revision: portfolio.revision }); }
    catch (err) { throw new HttpError(409, err.message); }
    const key = { portfolioId_snapshotAt: { portfolioId, snapshotAt } };
    const existing = await db.snapshot.findUnique({ where: key, select: { id: true } });
    const snapshot = await db.snapshot.upsert({ where: key, update: data, create: { portfolioId, snapshotAt, ...data } });
    return { snapshot, created: !existing, duplicateMinute: !!existing };
  }, { timeout: 20000 });
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
});
