import { decimalField, sumDecimal } from './financialDecimal.js';

/** Catalogue IDs identify holdings; legacy data is separated by symbol and exchange. */
export const holdingKey = holding => holding.instrumentId || JSON.stringify([holding.symbol, holding.exchange || '', holding.assetType || '']);
export const holdingPriceMeta = (holding, meta) => meta?.[holding.instrumentId || holding.symbol];

export function stockHoldingMetrics(activeHoldings, holdings, now = new Date()) {
  const total = sumDecimal(activeHoldings, h => decimalField(h, 'marketValue'));
  const concentrationMap = Object.create(null), daysSinceLastBuyMap = Object.create(null);
  for (const h of activeHoldings) concentrationMap[holdingKey(h)] = total.gt(0) ? decimalField(h, 'marketValue').div(total).times(100).toNumber() : 0;
  for (const h of holdings) {
    const lastLot = [...(h.lots || [])].sort((a, b) => b.date.localeCompare(a.date))[0];
    daysSinceLastBuyMap[holdingKey(h)] = lastLot ? Math.round((now - new Date(lastLot.date)) / 864e5) : null;
  }
  return { concentrationMap, daysSinceLastBuyMap };
}
