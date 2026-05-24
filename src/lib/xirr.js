/** Annualised rates outside this range are treated as non-convergent. */
const MAX_REASONABLE_RATE = 5.0; // 500% p.a. as a decimal fraction
const MIN_REASONABLE_RATE = -0.99; // -99% p.a.

/** If the step size hasn't shrunk for this many consecutive iterations,
 *  assume oscillation and abort. */
const STALL_PATIENCE = 12;

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

  const dates = cashflows.map((c) => new Date(c.date));
  const amounts = cashflows.map((c) => c.amount);
  const d0 = dates[0];
  const yr = (i) => (dates[i] - d0) / (365.25 * 864e5);

  const npv = (r) =>
    amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, yr(i)), 0);
  const dnpv = (r) =>
    amounts.reduce(
      (s, a, i) => s - (yr(i) * a) / Math.pow(1 + r, yr(i) + 1),
      0,
    );

  // Try multiple starting points so the solver is less sensitive to the
  // initial guess.  For most real portfolios one of these will converge.
  const SEEDS = [0.1, 0.5, -0.1, 2.0];

  for (const seed of SEEDS) {
    const result = _solve(seed, npv, dnpv);
    if (result !== null) return result * 100; // convert to percentage
  }

  return null; // all seeds failed to converge to a reasonable value
}

/**
 * _solve — run the Newton-Raphson loop from a single starting rate.
 * Returns the converged rate as a decimal fraction, or null.
 */
function _solve(seed, npv, dnpv) {
  let rate = seed;
  let converged = false;
  let prevDelta = Infinity;
  let stall = 0;

  for (let k = 0; k < 200; k++) {
    const f = npv(rate);
    const d = dnpv(rate);

    // Derivative too small → division would be meaningless
    if (Math.abs(d) < 1e-12) break;

    const step = f / d;

    // Infinite / NaN step means the function is not well-behaved here
    if (!isFinite(step)) break;

    const nr = rate - step;

    // Convergence check
    const delta = Math.abs(nr - rate);
    if (delta < 1e-8) {
      rate = nr;
      converged = true;
      break;
    }

    // Oscillation / stall detection: if the improvement in delta has stopped
    // shrinking, we're likely bouncing between two values.
    if (delta >= prevDelta) {
      stall++;
      if (stall >= STALL_PATIENCE) break;
    } else {
      stall = 0;
    }
    prevDelta = delta;

    // Clamp to a range that keeps the math stable.
    // Use a tighter ceiling than the original 100 — if we haven't converged
    // to something below 50x (5,000%) by now, the cash flows are degenerate.
    rate = Math.max(Math.min(nr, MAX_REASONABLE_RATE), MIN_REASONABLE_RATE);
  }

  if (!converged) return null;

  // Reasonableness guard: reject rates outside the plausible investment range.
  // This catches the edge-case where the solver "converges" at the clamp boundary
  // because the actual root is at ±∞ (e.g. trivially profitable one-day trade).
  if (rate > MAX_REASONABLE_RATE || rate < MIN_REASONABLE_RATE) return null;
  if (!isFinite(rate) || isNaN(rate)) return null;

  return rate;
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
    ...lots.map((l) => ({ amount: -(l.qty * l.price), date: l.date })),
    ...(sells || []).map((s) => ({
      amount: s.qty * s.sellPrice,
      date: s.date,
    })),
    ...(totalQty > 0
      ? [
          {
            amount: totalQty * cmp,
            date: new Date().toISOString().slice(0, 10),
          },
        ]
      : []),
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
    { amount: lot.qty * cmp, date: new Date().toISOString().slice(0, 10) },
  ]);
}
