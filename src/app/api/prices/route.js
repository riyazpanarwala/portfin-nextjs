import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';
import { requireAdmin } from '@/lib/auth';
import { decimalInput } from '@/lib/ledger';
import { collectInstrumentPrices } from '@/lib/priceService';
import { dayKey } from '@/lib/financialRules';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler('POST /api/prices', async request => {
  const { instrumentIds, force = false, cacheOnly = false } = await request.json();
  if (!Array.isArray(instrumentIds) || instrumentIds.length > 100 || instrumentIds.some(id => typeof id !== 'string' || !id || id.length > 64)) return badRequest('Provide up to 100 instrument IDs');
  if (!instrumentIds.length) return NextResponse.json({ prices: {}, meta: {} });
  const instruments = await prisma.instrument.findMany({ where: { id: { in: [...new Set(instrumentIds)] } } });
  return NextResponse.json(await collectInstrumentPrices(instruments, { force, cacheOnly }));
});

export const PATCH = withErrorHandler('PATCH /api/prices', async (request, { session }) => {
  requireAdmin(session);
  const { symbol, instrumentId, price } = await request.json();
  const value = decimalInput(price);
  if (!instrumentId && typeof symbol !== 'string') return badRequest('Instrument required');
  const matches = await prisma.instrument.findMany({ where: instrumentId ? { id: instrumentId } : { symbol: symbol.toUpperCase() } });
  if (matches.length !== 1) return badRequest('Select one exact instrument');
  const instrument = matches[0];
  const asOf = dayKey(new Date());
  await prisma.instrument.update({ where: { id: instrument.id }, data: { price: value, priceUpdatedAt: new Date(), priceAsOf: new Date(asOf), priceSource: 'manual' } });
  const record = { source: 'manual', asOf, updatedAt: new Date().toISOString(), stale: false };
  return NextResponse.json({ success: true, updated: 1, prices: { [instrument.id]: Number(value), [instrument.symbol]: Number(value) }, meta: { [instrument.id]: record, [instrument.symbol]: record } });
});
