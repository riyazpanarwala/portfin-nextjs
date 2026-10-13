export const ENGINE_VERSION = 'fifo-v3-decimal';
// Prior verified snapshots stay visible; only new valuations use the decimal engine.
export const isVerifiedSnapshot = snapshot => !snapshot.stale && !!snapshot.valuationAt && ['fifo-v2', ENGINE_VERSION].includes(snapshot.engineVersion);
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
  if (sell.taxCategory !== 'EQUITY_ELIGIBLE') return 'Verify equity eligibility and STT conditions.';
  if (sell.date < '2024-07-23') return 'Historical tax rates require a separate reviewed calculation.';
  if (lot.buyDate < '2018-02-01' && lot.taxType === 'LTCG') return 'Verify grandfathered acquisition cost.';
  if (lot.feesNeedReview) return 'Confirm tax-deductible charges separately from total charges.';
  return null;
}
