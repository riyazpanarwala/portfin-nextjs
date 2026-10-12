import { HttpError } from './auth.js';

export async function resolveAnalyticsHoldings(holdings, db) {
  if (!Array.isArray(holdings) || holdings.length > 1000) throw new HttpError(400, 'Provide up to 1000 holdings.');
  const ids = new Set();
  for (const row of holdings) {
    if (!row || typeof row.instrumentId !== 'string' || !row.instrumentId || row.instrumentId.length > 64 ||
        typeof row.marketValue !== 'number' || !Number.isFinite(row.marketValue) || row.marketValue < 0 || ids.has(row.instrumentId)) {
      throw new HttpError(400, 'Provide unique instrument IDs and finite, non-negative market values.');
    }
    ids.add(row.instrumentId);
  }
  if (!holdings.length) return [];
  const instruments = await db.instrument.findMany({ where: { id: { in: [...ids] } } });
  const byId = new Map(instruments.map(instrument => [instrument.id, instrument]));
  // Exchange, symbol and asset type come from the catalogue, never a bare-symbol fallback.
  return holdings.map(row => ({ instrumentId: row.instrumentId, marketValue: row.marketValue, instrument: byId.get(row.instrumentId) || null }));
}
