import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, flattenTrade } from '@/lib/apiHelpers';
import { requireOwnedPortfolio, HttpError } from '@/lib/auth';
import { dateOnly, decimalInput, lockPortfolio, reviseLedger, tradeOrder } from '@/lib/ledger';
import { applyCorporateActions } from '@/lib/corporateActions';
import { dayKey } from '@/lib/financialRules';
import { decimal, decimalField, financialResult } from '@/lib/financialDecimal';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler('POST /api/corporate-actions', async (request, { session }) => {
  const { portfolioId, instrumentId, actionType, ratioNumerator, ratioDenominator, exDate: rawDate, preview = false, expectedRevision } = await request.json();
  await requireOwnedPortfolio(portfolioId, session);
  if (!instrumentId || !['SPLIT', 'BONUS', 'REVERSE_SPLIT'].includes(actionType)) throw new HttpError(400, 'Instrument and valid action type required');
  const exDate = dateOnly(rawDate);
  if (exDate > dayKey(new Date())) throw new HttpError(400, 'Future corporate actions cannot be applied yet');
  const num = decimalInput(ratioNumerator, { scale: 6 });
  const den = decimalInput(ratioDenominator, { scale: 6 });
  const multiplier = decimal(num).div(den);
  if (!multiplier.isFinite() || multiplier.lte(0) || multiplier.gt(10000)) throw new HttpError(400, 'Invalid ratio');
  const result = await prisma.$transaction(async db => {
    await lockPortfolio(db, portfolioId, session.userId);
    const portfolio = await db.portfolio.findUnique({ where: { id: portfolioId } });
    if (!preview && (!Number.isInteger(expectedRevision) || expectedRevision !== portfolio.revision)) throw new HttpError(409, 'The portfolio changed or preview is missing. Preview again.');
    const instrument = await db.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument || instrument.assetType !== 'STOCK') throw new HttpError(400, 'A stock instrument is required');
    const rawTrades = await db.trade.findMany({ where: { portfolioId, instrumentId }, include: { instrument: true }, orderBy: tradeOrder });
    if (!rawTrades.length) throw new HttpError(400, 'This instrument has no trades in your portfolio');
    const actions = await db.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
    if (actions.some(a => a.instrumentId === instrumentId && dayKey(a.exDate) === exDate)) throw new HttpError(409, 'An action for this instrument and date already exists');
    const candidate = { id: 'preview', instrumentId, portfolioId, actionType, ratioNumerator: num, ratioDenominator: den, exDate };
    const flat = rawTrades.map(flattenTrade);
    const before = applyCorporateActions(flat, actions, exDate);
    const after = applyCorporateActions(flat, [...actions, candidate], exDate);
    const previewTrades = after.map(t => {
      const old = before.find(b => b.id === t.id);
      return financialResult({ id: t.id, tradeDate: t.tradeDate, tradeType: t.tradeType, oldQty: decimal(old?.quantity), oldPrice: decimal(old?.price), oldInvested: decimal(old?.grossAmount), newQty: decimal(t.quantity), newPrice: decimal(t.price), newInvested: decimal(t.grossAmount) });
    }).filter(t => !decimalField(t, 'oldQty').eq(decimalField(t, 'newQty')) || !decimalField(t, 'oldPrice').eq(decimalField(t, 'newPrice')));
    if (!previewTrades.length) throw new HttpError(400, 'No eligible pre-action holdings or trades');
    if (preview) return { preview: true, revision: portfolio.revision, symbol: instrument.symbol, multiplier: multiplier.toNumber(), affectedCount: previewTrades.length, trades: previewTrades };
    await db.corporateAction.create({ data: { portfolioId, instrumentId, actionType, ratioNumerator: num, ratioDenominator: den, exDate: new Date(exDate) } });
    await reviseLedger(db, portfolioId, exDate);
    return { success: true, message: 'Corporate action recorded. Original trades are preserved.', updatedCount: previewTrades.length };
  });
  return NextResponse.json(result);
});
