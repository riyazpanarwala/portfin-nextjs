// Delisted holdings keep their stored valuation, but must not be queried as
// currently traded securities. Shared by browser, API, analytics and scripts.
const DELISTED_STOCKS = new Set(['UTTAMVALUE']);

export function isDelistedStock(instrument) {
  return instrument?.assetType === 'STOCK' && DELISTED_STOCKS.has(instrument.symbol?.trim().toUpperCase());
}
