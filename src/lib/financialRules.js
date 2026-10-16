export const ENGINE_VERSION = 'fifo-v3-decimal';
// Prior verified snapshots stay visible; only new valuations use the decimal engine.
export const isUserVerifiedSnapshot = snapshot => snapshot.engineVersion === 'user-accepted-v1' && snapshot.priceProvenance?.__verification?.source === 'user-acknowledgement';
export const isVerifiedSnapshot = snapshot => !snapshot.stale && !!snapshot.valuationAt && (['fifo-v2', ENGINE_VERSION].includes(snapshot.engineVersion) || isUserVerifiedSnapshot(snapshot));
export function snapshotReviewReason(snapshot) {
  if (!snapshot.valuationAt) return 'Legacy snapshot: valuation date and price records were not verified.';
  if (snapshot.stale) return 'Needs rebuild: trade history or corporate actions changed after this snapshot was saved.';
  if (isUserVerifiedSnapshot(snapshot)) return null;
  if (!['fifo-v2', ENGINE_VERSION].includes(snapshot.engineVersion)) return 'Legacy snapshot: calculation version is not verified.';
  return null;
}
export const dayKey = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);

export function isLongTermEquity(buyDate, sellDate) {
  const anniversary = new Date(`${buyDate}T00:00:00Z`);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  return sellDate > anniversary.toISOString().slice(0, 10);
}

export function currentFinancialYear(asOf = new Date()) {
  const date = dayKey(asOf);
  const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
  return `${year}-${String(year + 1).slice(-2)}`;
}

export function equityTaxReview(sell, lot) {
  if (!usesEquityTaxRules(sell)) return 'Instrument tax category is unresolved; confirm equity eligibility and STT conditions.';
  if (sell.date < '2024-07-23') return 'Historical tax rates require a separate reviewed calculation.';
  if (lot.buyDate < '2018-02-01' && lot.taxType === 'LTCG') return 'Verify grandfathered acquisition cost.';
  if (lot.feesNeedReview) return 'Confirm tax-deductible charges separately from total charges.';
  return null;
}

// Existing listed-stock records predate taxCategory. Use their stored asset and
// exchange metadata by default, while respecting an explicit non-equity category.
export function usesEquityTaxRules(instrument) {
  if (instrument.taxCategory === 'EQUITY_ELIGIBLE') return true;
  if (instrument.taxCategory && instrument.taxCategory !== 'UNKNOWN') return false;
  // Exchange-traded funds are also stored as STOCK; listing alone cannot
  // distinguish equity funds from debt, gold or silver funds.
  if ((instrument.isin || '').startsWith('INF') || /ETF|BEES|MUTUAL FUND/i.test(`${instrument.symbol || ''} ${instrument.name || ''} ${instrument.sector || ''}`)) return false;
  return instrument.assetType === 'STOCK' && ['NSE', 'BSE'].includes(instrument.exchange);
}
