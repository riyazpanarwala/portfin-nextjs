import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { HttpError } from './auth.js';
import { lockPortfolio, reviseLedger } from './ledger.js';

export function validateSubmissionKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new HttpError(400, 'A valid Idempotency-Key header is required.');
  return key;
}

export function tradeRequestHash(input) {
  const decimal = value => value == null ? null : new Prisma.Decimal(value).toString();
  const canonical = [input.portfolioId, input.symbol.toUpperCase(), input.exchange, input.assetType, input.tradeType,
    decimal(input.quantity), decimal(input.price), decimal(input.brokerage), decimal(input.taxBrokerage), input.tradeDate,
    input.name || input.symbol.toUpperCase(), input.sector || null, input.isin || null];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function saveTradeOnce(db, session, input, key) {
  validateSubmissionKey(key);
  const requestHash = tradeRequestHash(input);
  return db.$transaction(async tx => {
    await lockPortfolio(tx, input.portfolioId, session.userId);
    const existing = await tx.tradeSubmission.findUnique({
      where: { portfolioId_key: { portfolioId: input.portfolioId, key } },
      include: { trade: { include: { instrument: true } } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new HttpError(409, 'This submission key was already used for a different trade.');
      if (!existing.trade) throw new HttpError(409, 'This submitted trade was deleted. Start a new submission to create another trade.');
      return { trade: existing.trade, replayed: true };
    }
    const { portfolioId, symbol, exchange, assetType, name, sector, isin, tradeType, quantity, price, brokerage, taxBrokerage, tradeDate } = input;
    const instrument = await tx.instrument.upsert({
      where: { symbol_exchange: { symbol: symbol.toUpperCase(), exchange } }, update: {},
      create: { symbol: symbol.toUpperCase(), name: name || symbol.toUpperCase(), exchange, assetType, sector: sector || null, isin: isin || null },
    });
    if (instrument.assetType !== assetType) throw new HttpError(400, 'Instrument asset type mismatch');
    const trade = await tx.trade.create({ data: { portfolioId, instrumentId: instrument.id, tradeType, quantity, price, brokerage, taxBrokerage, tradeDate: new Date(tradeDate) }, include: { instrument: true } });
    await tx.tradeSubmission.create({ data: { portfolioId, key, requestHash, tradeId: trade.id } });
    await reviseLedger(tx, portfolioId, tradeDate);
    return { trade, replayed: false };
  });
}
