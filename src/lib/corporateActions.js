import { dayKey } from './financialRules.js';

// Normalize a copy to units applicable at asOf. The immutable ledger is never changed.
export function applyCorporateActions(trades, actions = [], asOf = dayKey(new Date())) {
  let effective = trades.filter(t => dayKey(t.tradeDate) <= asOf).map(t => ({ ...t }));
  const sorted = [...actions].filter(a => dayKey(a.exDate) <= asOf).sort((a, b) => dayKey(a.exDate).localeCompare(dayKey(b.exDate)) || String(a.id).localeCompare(String(b.id)));
  for (const action of sorted) {
    const date = dayKey(action.exDate);
    const before = effective.filter(t => t.instrumentId === action.instrumentId && dayKey(t.tradeDate) < date);
    const ratio = Number(action.ratioNumerator) / Number(action.ratioDenominator);
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Invalid corporate action ratio');
    if (!before.length) continue;
    if (action.actionType === 'BONUS') {
      const quantity = before.reduce((sum, t) => sum + (t.tradeType === 'BUY' ? 1 : -1) * Number(t.quantity), 0);
      if (quantity < -1e-9) throw new Error('Cannot apply a bonus to an unreconciled ledger');
      if (quantity > 1e-9) effective.push({ ...before[0], id: `bonus:${action.id}`, createdAt: `${date}T00:00:00Z`, tradeDate: date, tradeType: 'BUY', quantity: quantity * ratio, price: 0, brokerage: 0, taxBrokerage: 0, synthetic: true });
    } else if (['SPLIT', 'REVERSE_SPLIT'].includes(action.actionType)) {
      effective = effective.map(t => t.instrumentId === action.instrumentId && dayKey(t.tradeDate) < date ? { ...t, quantity: Number(t.quantity) * ratio, price: Number(t.price) / ratio } : t);
    } else throw new Error('Unsupported corporate action');
  }
  return effective;
}
