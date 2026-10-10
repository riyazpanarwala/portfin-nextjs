import { HttpError } from './auth.js';

export const tradeOrder = [{ tradeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];

export function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Invalid date; use YYYY-MM-DD');
  return value;
}

export function decimalInput(value, { scale = 4, zero = false, optional = false } = {}) {
  if (optional && (value == null || value === '')) return null;
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text) || (text.split('.')[1]?.length || 0) > scale || !Number.isFinite(Number(text)) || (zero ? Number(text) < 0 : Number(text) <= 0)) throw new HttpError(400, 'Invalid positive decimal or precision');
  return text;
}

export async function reviseLedger(db, portfolioId, fromDate) {
  await db.portfolio.update({ where: { id: portfolioId }, data: { revision: { increment: 1 } } });
  await db.snapshot.updateMany({ where: { portfolioId, OR: [{ valuationAt: null }, { valuationAt: { gte: new Date(fromDate) } }] }, data: { stale: true } });
}

// A portfolio row lock serializes writers, including snapshot saves.
export async function lockPortfolio(db, portfolioId, userId) {
  const result = await db.portfolio.updateMany({ where: { id: portfolioId, userId }, data: { revision: { increment: 0 } } });
  if (!result.count) throw new HttpError(404, 'Portfolio not found');
}
