import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDrawdown, drawdownHistory } from '../../src/lib/drawdown.js';
import { ENGINE_VERSION } from '../../src/lib/financialRules.js';

const snapshot = (day, value, verified = true, time = '18:00:00') => ({
  snapshotAt: `2026-10-${day}T${time}.000Z`, totalValue: String(value),
  valuationAt: verified ? `2026-10-${day}` : null, stale: !verified, engineVersion: ENGINE_VERSION,
});

test('saved history retains the declines hidden by verified-only filtering', () => {
  const rows = [snapshot('16', 3967000), snapshot('15', 3959000), snapshot('14', 3981000, false), snapshot('13', 3950000, false), snapshot('12', 3932000)];
  const saved = analyzeDrawdown(drawdownHistory(rows));
  const verified = analyzeDrawdown(drawdownHistory(rows, true));
  assert.equal(saved.maxDrawdownDate, '2026-10-15');
  assert.equal(saved.maxDrawdownPeakDate, '2026-10-14');
  assert.ok(Math.abs(saved.maxDrawdown - (3959000 / 3981000 - 1) * 100) < 1e-10);
  assert.ok(saved.currentDrawdown < 0);
  assert.equal(verified.maxDrawdown, 0);
  assert.equal(verified.maxDrawdownDate, null);
  assert.equal(drawdownHistory(rows).length, 5);
});

test('daily checkpoints use the last save, sort chronologically and exclude unusable values', () => {
  const rows = [snapshot('16', 120), snapshot('15', 105), snapshot('15', 100, true, '10:00:00'), snapshot('14', 'bad'), snapshot('13', 0)];
  const original = structuredClone(rows);
  assert.deepEqual(drawdownHistory(rows).map(row => Number(row.totalValue)), [0, 105, 120]);
  assert.deepEqual(rows, original);
  assert.equal(analyzeDrawdown([snapshot('16', 100), snapshot('16', 110)]), null);
  assert.equal(analyzeDrawdown([]), null);
});

const trade = (day, tradeType, amount, brokerage = 0) => ({ tradeDate: `2026-10-${day}`, tradeType, quantity: '1', price: String(amount), brokerage });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('selling at unchanged prices, adding capital and reinvesting do not create drawdown', () => {
  const result = analyzeDrawdown([
    snapshot('12', 1000), snapshot('13', 800), snapshot('14', 1300), snapshot('15', 1300),
  ], [trade('13', 'SELL', 200), trade('14', 'BUY', 500), trade('15', 'SELL', 300), trade('15', 'BUY', 300)]);
  near(result.maxDrawdown, 0);
  near(result.allTimePeak, 100);
});

test('a deposit cannot erase an existing drawdown, and a sale cannot deepen it', () => {
  const result = analyzeDrawdown([
    snapshot('12', 1000), snapshot('13', 800), snapshot('14', 1800), snapshot('15', 1400),
  ], [trade('14', 'BUY', 1000), trade('15', 'SELL', 400)]);
  near(result.currentDrawdown, -20);
  assert.equal(result.recoveries.length, 0);
  assert.equal(result.maxDrawdownDate, '2026-10-13');
});

test('real investment losses and brokerage remain after cash-flow adjustment', () => {
  const result = analyzeDrawdown([snapshot('12', 1000), snapshot('13', 1400)], [trade('13', 'BUY', 500)]);
  near(result.currentDrawdown, -100 / 1250 * 100);
  const sale = analyzeDrawdown([snapshot('12', 1000), snapshot('13', 800)], [trade('13', 'SELL', 200, 2)]);
  near(sale.currentDrawdown, -2 / 901 * 100);
  const buy = analyzeDrawdown([snapshot('12', 1000), snapshot('13', 1200)], [trade('13', 'BUY', 200, 2)]);
  near(buy.currentDrawdown, -2 / 1101 * 100);
});

test('liquidation, empty checkpoints and subsequent investment preserve performance', () => {
  const result = analyzeDrawdown([snapshot('12', 1000), snapshot('13', 0), snapshot('14', 0), snapshot('15', 500)],
    [trade('13', 'SELL', 1000), trade('15', 'BUY', 500)]);
  near(result.currentDrawdown, 0);
  assert.equal(result.drawdownSeries.length, 4);
});

test('weights trades by date across sparse checkpoints and excludes boundary trades', () => {
  const result = analyzeDrawdown([snapshot('12', 1000), snapshot('16', 1400)],
    [trade('12', 'BUY', 1000), trade('13', 'BUY', 500), trade('17', 'SELL', 100)]);
  near(result.currentDrawdown, -100 / (1000 + 500 * 3.5 / 4) * 100);
});

test('uses valuation dates, not save dates, when matching trades and checkpoints', () => {
  const rows = [{ ...snapshot('15', 1000), valuationAt: '2026-10-12' },
    { ...snapshot('16', 800), valuationAt: '2026-10-13' }];
  const result = analyzeDrawdown(rows, [trade('13', 'SELL', 200)]);
  near(result.currentDrawdown, 0);
  assert.equal(result.drawdownSeries[0].date, '2026-10-12');
});

test('unusable capital and invalid trades report an error instead of false performance', () => {
  assert.ok(analyzeDrawdown([snapshot('12', 100), snapshot('13', 10)], [trade('13', 'SELL', 300)]).error);
  assert.ok(analyzeDrawdown([snapshot('12', 100), snapshot('13', 10)], [trade('13', 'SELL', 'bad')]).error);
});

test('small declines count and recovery requires regaining the full prior peak', () => {
  const analysis = analyzeDrawdown([snapshot('12', 100), snapshot('13', 99.2), snapshot('14', 99.6), snapshot('15', 100)]);
  assert.equal(analysis.recoveries.length, 1);
  assert.deepEqual(analysis.recoveries[0], { start: '2026-10-13', end: '2026-10-15', days: 2 });
  assert.equal(analysis.currentDrawdownDays, null);
  const pending = analyzeDrawdown([snapshot('12', 100), snapshot('13', 99.2), snapshot('14', 99.6)]);
  assert.equal(pending.recoveries.length, 0);
  assert.equal(pending.currentDrawdownDays, 1);
});

test('verified-only mode excludes stale and unknown-engine entries even with a valuation date', () => {
  const rows = [snapshot('12', 100), { ...snapshot('13', 90), stale: true }, { ...snapshot('14', 80), engineVersion: 'legacy' }, snapshot('15', 105)];
  assert.equal(drawdownHistory(rows, true).length, 2);
  assert.equal(drawdownHistory(rows).length, 4);
});
