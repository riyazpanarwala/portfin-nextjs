# Decimal financial calculations and stock identity

The FIFO engine now uses Prisma's existing browser-safe Decimal implementation,
with an isolated 40-significant-digit configuration. No dependency or database
schema change is required. Ledger quantities, prices and fees enter calculations
as decimal strings. Cost allocation uses total lot costs rather than multiplying
by a rounded per-unit average. The final allocation consumes residual cost and
fees, including separately recorded deductible fees.

Holding, lot, sale, portfolio and tax results retain their numeric UI fields and
include an `exact` object containing decimal strings for subsequent calculations.
Portfolio aggregation, snapshot valuation, tax set-off, harvesting and CSV export
read these exact values. Lot tables and XIRR cash-flow construction use the
remaining total lot cost. The iterative XIRR/CAGR algorithms remain numerical
approximations; chart and UI values remain JavaScript numbers.

Rounding uses half-up at explicit boundaries. Snapshots are rounded to two
decimal places and passed to Prisma as strings. Tax CSV amounts are rounded for
export, rather than during FIFO allocation. Existing income-tax JSON exports
retain their numeric schema and two-decimal row rounding; their numeric format
still has JavaScript's representational limits for extremely large amounts.

New snapshots record `fifo-v3-decimal`. Previously verified `fifo-v2` snapshots
remain visible and are not rewritten automatically. Recalculate historical
snapshots through the existing backfill flow when reconciliation is desired.
That is a separate data operation, not required to deploy these code changes.

Stocks use catalogue instrument IDs for row keys, expansion, concentration,
last-buy age and price metadata. Legacy rows without IDs use a composite identity
for view state. Duplicate symbols show their exchange in allocation labels.
CSV exports include exchange and instrument ID so listings can be distinguished.

Regression tests cover fractional FIFO closure, partial multi-price sales,
recurring cost/fee conservation, large quantities, corporate actions, missing
prices, zero quantities, tax rounding and harvesting. The PostgreSQL suite also
checks exact decimal ledger-to-snapshot persistence in a disposable schema.
