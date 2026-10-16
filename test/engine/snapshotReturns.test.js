import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHoldings, computePortfolioStats } from '../../src/lib/store.js';
import { buildSnapshotData, snapshotWithStockReturn } from '../../src/lib/snapshotValuation.js';
import { ENGINE_VERSION, snapshotReviewReason, isVerifiedSnapshot } from '../../src/lib/financialRules.js';

const asOf = '2026-10-16';
const buy = (symbol, tradeDate, price, quantity = 1) => ({ symbol, instrumentId: symbol, assetType: 'STOCK', exchange: 'NSE', tradeType: 'BUY', tradeDate, price, quantity });
const rows = [buy('OLD', '2020-01-01', 1000), buy('NEW', '2026-10-01', 100)];
const prices = { OLD: 900, NEW: 110 };
const meta = Object.fromEntries(Object.keys(prices).map(key => [key, { asOf, source: 'test' }]));

test('aggregate stock return remains negative when averaged individual CAGRs suggest a gain', () => {
  const holdings = computeHoldings(rows, prices, { asOf });
  const oldAverage = holdings.reduce((sum, h) => sum + h.invested * h.cagr, 0) / 1100;
  assert.ok(oldAverage > 0);
  const stats = computePortfolioStats(holdings);
  assert.equal(stats.stValue, 1010);
  assert.equal(stats.stInvested, 1100);
  assert.ok(stats.stCagr < 0);
  assert.ok(stats.stCagr > -5);
});

test('aggregate stock return uses lot dates and snapshot date, not the wall clock', () => {
  const holdings = computeHoldings([buy('A', '2024-10-16', 100)], { A: 121 }, { asOf });
  assert.ok(Math.abs(computePortfolioStats(holdings).stCagr - 10) < 0.02);
  const loss = computeHoldings([buy('A', '2024-10-16', 100)], { A: 81 }, { asOf });
  assert.ok(Math.abs(computePortfolioStats(loss).stCagr + 10) < 0.02);
});

test('open stock return excludes closed positions and realized sales', () => {
  const trades = [buy('A', '2024-10-16', 100, 2), { ...buy('A', '2025-10-16', 1000), tradeType: 'SELL' }];
  const stats = computePortfolioStats(computeHoldings(trades, { A: 81 }, { asOf }));
  assert.equal(stats.totalRealizedGain, 900);
  assert.ok(stats.stCagr < 0);
});

test('same-day and missing-price stock returns remain unavailable in snapshots', () => {
  const sameDay = [buy('A', asOf, 100)];
  const data = buildSnapshotData(sameDay, { A: 110 }, { A: { asOf } }, { asOf, revision: 1 });
  assert.equal(data.stCagr, null);
  assert.equal(computePortfolioStats(computeHoldings(rows, {}, { asOf })).stCagr, null);
});

test('saved stock returns are recalculated only with verified recorded historical prices', () => {
  const saved = { ...buildSnapshotData(rows, prices, meta, { asOf, revision: 1 }), stCagr: '32.74', snapshotAt: new Date(asOf), id: 'snapshot' };
  const corrected = snapshotWithStockReturn(saved, rows);
  assert.ok(Number(corrected.stCagr) < 0);
  assert.equal(corrected.totalValue, saved.totalValue);
  assert.equal(corrected.stockReturnMethod, 'open-lot-xirr');
  assert.equal(saved.stCagr, '32.74');
  for (const snapshot of [{ ...saved, stale: true }, { ...saved, valuationAt: null }, { ...saved, priceProvenance: null }, { ...saved, priceProvenance: {} }]) {
    assert.equal(snapshotWithStockReturn(snapshot, rows).stCagr, null);
  }
});

test('snapshot status distinguishes legacy metadata from ledger changes and engine versions', () => {
  assert.match(snapshotReviewReason({ stale: true }), /valuation date/);
  assert.match(snapshotReviewReason({ stale: true, valuationAt: asOf }), /trade history/);
  assert.match(snapshotReviewReason({ stale: false, valuationAt: asOf, engineVersion: 'old' }), /calculation version/);
  assert.equal(snapshotReviewReason({ stale: false, valuationAt: asOf, engineVersion: ENGINE_VERSION }), null);
});

test('user acknowledgement verifies saved values without implying reconstructed prices or returns', () => {
  const accepted = { valuationAt: asOf, stale: false, engineVersion: 'user-accepted-v1', stCagr: '32.74',
    priceProvenance: { __verification: { source: 'user-acknowledgement' } } };
  assert.equal(isVerifiedSnapshot(accepted), true);
  assert.equal(snapshotReviewReason(accepted), null);
  assert.equal(snapshotWithStockReturn(accepted, rows).stCagr, null);
  assert.equal(isVerifiedSnapshot({ ...accepted, stale: true }), false);
  assert.equal(isVerifiedSnapshot({ ...accepted, priceProvenance: {} }), false);
  assert.equal(isVerifiedSnapshot({ ...accepted, valuationAt: null }), false);
});
