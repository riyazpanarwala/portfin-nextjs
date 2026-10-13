import { dayKey } from './financialRules.js';
import { decimal, sumDecimal } from './financialDecimal.js';

// Normalize a copy to units applicable at asOf. The immutable ledger is never changed.
export function applyCorporateActions(trades, actions = [], asOf = dayKey(new Date())) {
  let effective = trades.filter(t => dayKey(t.tradeDate) <= asOf).map(t => {
    const quantity = decimal(t.quantity), price = decimal(t.price);
    if (!quantity.isFinite() || quantity.lt(0) || !price.isFinite() || price.lt(0)) throw new Error('Invalid trade quantity or price');
    for (const field of ['brokerage', 'taxBrokerage']) {
      const fee = decimal(t[field]);
      if (!fee.isFinite() || fee.lt(0)) throw new Error('Invalid trade fee');
    }
    return { ...t, grossAmount: quantity.times(price).toFixed() };
  });
  const sorted = [...actions].filter(a => dayKey(a.exDate) <= asOf).sort((a, b) => dayKey(a.exDate).localeCompare(dayKey(b.exDate)) || String(a.id).localeCompare(String(b.id)));
  for (const action of sorted) {
    const date = dayKey(action.exDate);
    const before = effective.filter(t => t.instrumentId === action.instrumentId && dayKey(t.tradeDate) < date);
    const numerator = decimal(action.ratioNumerator), denominator = decimal(action.ratioDenominator);
    if (!numerator.isFinite() || !denominator.isFinite() || numerator.lte(0) || denominator.lte(0)) throw new Error('Invalid corporate action ratio');
    if (!before.length) continue;
    if (action.actionType === 'BONUS') {
      const quantity = sumDecimal(before, t => decimal(t.quantity).times(t.tradeType === 'BUY' ? 1 : -1));
      if (quantity.lt('-0.000000001')) throw new Error('Cannot apply a bonus to an unreconciled ledger');
      if (quantity.gt('0.000000001')) effective.push({ ...before[0], id: `bonus:${action.id}`, createdAt: `${date}T00:00:00Z`, tradeDate: date, tradeType: 'BUY', quantity: quantity.times(numerator).div(denominator).toFixed(), price: 0, grossAmount: '0', brokerage: 0, taxBrokerage: 0, synthetic: true });
    } else if (['SPLIT', 'REVERSE_SPLIT'].includes(action.actionType)) {
      effective = effective.map(t => t.instrumentId === action.instrumentId && dayKey(t.tradeDate) < date ? {
        ...t, quantity: decimal(t.quantity).times(numerator).div(denominator).toFixed(),
        price: decimal(t.price).times(denominator).div(numerator).toFixed(),
      } : t);
    } else throw new Error('Unsupported corporate action');
  }
  return effective;
}
