import test from 'node:test';
import assert from 'node:assert/strict';
import { holdingKey, holdingPriceMeta, stockHoldingMetrics, stockAllocationLabel } from '../../src/lib/holdingIdentity.js';

test('duplicate stock symbols retain independent concentration and last-buy metrics by instrument ID', () => {
  const rows = [
    { instrumentId: 'nse', symbol: 'DUP', exchange: 'NSE', marketValue: 100, lots: [{ date: '2026-10-01' }] },
    { instrumentId: 'bse', symbol: 'DUP', exchange: 'BSE', marketValue: 300, lots: [{ date: '2026-09-01' }, { date: '2026-09-20' }] },
    { instrumentId: 'exited', symbol: 'DUP', exchange: 'NSE', marketValue: 0, lots: [] },
  ];
  const { concentrationMap, daysSinceLastBuyMap } = stockHoldingMetrics(rows.slice(0, 2), rows, new Date('2026-10-13T00:00:00Z'));
  assert.equal(concentrationMap.nse, 25);
  assert.equal(concentrationMap.bse, 75);
  assert.equal(concentrationMap.exited, undefined);
  assert.equal(daysSinceLastBuyMap.nse, 12);
  assert.equal(daysSinceLastBuyMap.bse, 23);
  assert.equal(daysSinceLastBuyMap.exited, null);
  assert.equal(concentrationMap.DUP, undefined);
});

test('holding identity prefers IDs and keeps legacy listings and asset types separate', () => {
  assert.equal(holdingKey({ instrumentId: 'catalogue-id', symbol: 'DUP', exchange: 'NSE' }), 'catalogue-id');
  assert.notEqual(holdingKey({ symbol: 'DUP', exchange: 'NSE' }), holdingKey({ symbol: 'DUP', exchange: 'BSE' }));
  assert.notEqual(holdingKey({ symbol: 'DUP', assetType: 'STOCK' }), holdingKey({ symbol: 'DUP', assetType: 'MF' }));
  const metrics = stockHoldingMetrics([], []);
  assert.deepEqual(Object.keys(metrics.concentrationMap), []);
  assert.deepEqual(Object.keys(metrics.daysSinceLastBuyMap), []);
});

test('stock detail price metadata never borrows another exchange through a symbol alias', () => {
  const meta = { nse: { source: 'yahoo', asOf: '2026-10-13' }, bse: { source: 'cache', asOf: '2026-10-10' }, DUP: { source: 'wrong' } };
  assert.equal(holdingPriceMeta({ instrumentId: 'nse', symbol: 'DUP' }, meta), meta.nse);
  assert.equal(holdingPriceMeta({ instrumentId: 'bse', symbol: 'DUP' }, meta), meta.bse);
  assert.equal(holdingPriceMeta({ instrumentId: 'missing', symbol: 'DUP' }, meta), undefined);
});

test('duplicate allocation labels use instrument IDs when exchange is absent and retain normal labels', () => {
  assert.equal(stockAllocationLabel({ symbol: 'DUP', exchange: 'NSE', instrumentId: 'nse' }, true), 'DUP (NSE)');
  assert.equal(stockAllocationLabel({ symbol: 'DUP', instrumentId: 'first' }, true), 'DUP (first)');
  assert.equal(stockAllocationLabel({ symbol: 'DUP', exchange: null, instrumentId: 'second' }, true), 'DUP (second)');
  assert.equal(stockAllocationLabel({ symbol: 'DUP', exchange: '', instrumentId: 'third' }, true), 'DUP (third)');
  assert.equal(stockAllocationLabel({ symbol: 'LEGACY' }, true), 'LEGACY (Unknown exchange)');
  assert.equal(stockAllocationLabel({ symbol: 'UNIQUE', instrumentId: 'first' }, false), 'UNIQUE');
});
