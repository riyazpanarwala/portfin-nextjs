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
  assert.deepEqual(drawdownHistory(rows).map(row => Number(row.totalValue)), [105, 120]);
  assert.deepEqual(rows, original);
  assert.equal(analyzeDrawdown([snapshot('16', 100), snapshot('16', 110)]), null);
  assert.equal(analyzeDrawdown([]), null);
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
