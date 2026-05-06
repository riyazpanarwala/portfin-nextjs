'use client';

/**
 * lib/xirr.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Newton-Raphson XIRR solver, extracted from store.js and HoldingsShared.js
 * where it was duplicated under different names (newtonXIRR / computeXIRR).
 *
 * All XIRR computations across the app import from here.
 */

/**
 * xirr — money-weighted annualised return for an arbitrary cash-flow series.
 *
 * @param {Array<{ date: string|Date, amount: number }>} cashflows
 *   Negative amounts = outflows (buys), positive = inflows (sells + terminal).
 *   Must have at least 2 entries.
 * @returns {number|null}  annualised return as a percentage, or null on failure
 */
export function xirr(cashflows) {
  if (!cashflows || cashflows.length < 2) return null;

  const dates   = cashflows.map(c => new Date(c.date));
  const amounts = cashflows.map(c => c.amount);
  const d0      = dates[0];
  const yr      = i => (dates[i] - d0) / (365.25 * 864e5);

  const npv  = r => amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, yr(i)), 0);
  const dnpv = r => amounts.reduce((s, a, i) => s - yr(i) * a / Math.pow(1 + r, yr(i) + 1), 0);

  let rate = 0.1;
  for (let k = 0; k < 200; k++) {
    const f = npv(rate);
    const d = dnpv(rate);
    if (Math.abs(d) < 1e-12) break;
    const nr = rate - f / d;
    if (Math.abs(nr - rate) < 1e-8) { rate = nr; break; }
    rate = Math.max(Math.min(nr, 100), -0.9999);
  }

  return isFinite(rate) ? rate * 100 : null;
}

/**
 * holdingXIRR — convenience wrapper for a single open/partially-closed holding.
 * Uses remaining lots as buy cash-flows, sell records as interim inflows,
 * and today's market value as the terminal inflow.
 *
 * @param {Array<{ date: string, qty: number, price: number }>} lots
 * @param {Array<{ date: string, qty: number, sellPrice: number }>} sells
 * @param {number} cmp  current market price per unit
 * @returns {number|null}
 */
export function holdingXIRR(lots, sells, cmp) {
  const totalQty = lots.reduce((s, l) => s + l.qty, 0);
  return xirr([
    ...lots.map(l  => ({ amount: -(l.qty * l.price), date: l.date })),
    ...(sells || []).map(s => ({ amount: s.qty * s.sellPrice, date: s.date })),
    ...(totalQty > 0
      ? [{ amount: totalQty * cmp, date: new Date().toISOString().slice(0, 10) }]
      : []
    ),
  ]);
}

/**
 * lotXIRR — XIRR for a single lot treated as a standalone investment.
 *
 * @param {{ date: string, qty: number, price: number }} lot
 * @param {number} cmp
 * @returns {number|null}
 */
export function lotXIRR(lot, cmp) {
  return xirr([
    { amount: -(lot.qty * lot.price), date: lot.date },
    { amount:   lot.qty * cmp,        date: new Date().toISOString().slice(0, 10) },
  ]);
}
