import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioChanges, periodStart } from '../../src/lib/portfolioChanges.js';

const buy = (date, quantity = 10, price = 100, id = 'A', assetType = 'STOCK') => ({ id: `${id}-${date}`, instrumentId: id, symbol: id, assetType, exchange: 'NSE', tradeType: 'BUY', tradeDate: date, quantity, price });
const history = (date, price) => ({ [date]: { price, asOf: date } });
function run(trades, extras = {}) {
  return buildPortfolioChanges({ trades, histories: { A: history('2026-10-16', 100) }, prices: { A: 110 }, meta: { A: { asOf: '2026-10-23' } }, asOf: '2026-10-23', ...extras }).periods;
}

test('period boundaries clamp month ends and leap years', () => {
  assert.equal(periodStart('2024-03-31', '1M'), '2024-02-29');
  assert.equal(periodStart('2024-02-29', '1Y'), '2023-02-28');
  assert.equal(periodStart('2026-10-23', '1W'), '2026-10-16');
});

test('price-only gains and percentages aggregate by asset class', () => {
  const periods = run([buy('2026-01-01'), buy('2026-01-01', 5, 100, 'B', 'MF')], {
    histories: { A: history('2026-10-16', 100), B: history('2026-10-16', 100) },
    prices: { A: 110, B: 80 }, meta: { A: { asOf: '2026-10-23' }, B: { asOf: '2026-10-23' } },
  });
  assert.equal(periods['1W'].stocks.gain, 100);
  assert.equal(periods['1W'].stocks.percent, 10);
  assert.equal(periods['1W'].mf.gain, -100);
  assert.equal(periods['1W'].overall.gain, 0);
});

test('new purchases are not counted as investment gains; fees reduce gain', () => {
  const periods = run([buy('2026-01-01'), { ...buy('2026-10-20', 10, 110), brokerage: 5 }]);
  assert.equal(periods['1W'].overall.gain, 95);
  assert.ok(periods['1W'].overall.percent > 0 && periods['1W'].overall.percent < 10);
});

test('partial and complete sales retain realized period gains', () => {
  for (const quantity of [5, 10]) {
    const result = run([buy('2026-01-01'), { ...buy('2026-10-20', quantity, 120), tradeType: 'SELL', brokerage: 5 }])['1W'];
    assert.equal(result.overall.gain, quantity === 5 ? 145 : 195);
    assert.equal(result.rows.length, 1);
  }
});

test('unavailable history does not silently turn partial coverage into an overall return', () => {
  const periods = run([buy('2026-01-01'), buy('2026-01-01', 10, 100, 'B', 'MF')]);
  assert.equal(periods['1W'].overall.gain, null);
  assert.equal(periods['1W'].overall.covered, 1);
  assert.equal(periods['1W'].stocks.gain, 100);
  assert.equal(periods['1W'].mf.gain, null);
  assert.equal(periods['1Y'].overall.gain, null);
});

test('daily return uses previous published price across a weekend', () => {
  const periods = run([buy('2026-01-01')], {
    asOf: '2026-10-19', histories: { A: { ...history('2026-10-15', 90), ...history('2026-10-16', 100) } },
    meta: { A: { asOf: '2026-10-19' } },
  });
  assert.equal(periods['1D'].rows[0].start, '2026-10-16');
  assert.equal(periods['1D'].overall.gain, 100);
});

test('recorded splits and bonuses do not create artificial price losses', () => {
  for (const actionType of ['SPLIT', 'BONUS']) {
    const result = run([buy('2026-01-01')], { prices: { A: 50 }, corporateActions: [{ id: 'split', instrumentId: 'A', actionType, exDate: '2026-10-20', ratioNumerator: actionType === 'SPLIT' ? 2 : 1, ratioDenominator: 1 }] })['1W'];
    assert.equal(result.overall.gain, 0);
  }
});

test('stale or pre-action current prices are unavailable', () => {
  assert.equal(run([buy('2026-01-01')], { meta: { A: { asOf: '2026-10-01' } } })['1W'].overall.gain, null);
  assert.equal(run([buy('2026-01-01'), buy('2026-10-23')], { meta: { A: { asOf: '2026-10-22' } } })['1W'].overall.gain, null);
});

test('a boundary price before a recorded split cannot value post-split units', () => {
  const result = run([buy('2026-01-01')], {
    histories: { A: history('2026-10-15', 100) }, prices: { A: 55 },
    corporateActions: [{ id: 'split', instrumentId: 'A', actionType: 'SPLIT', exDate: '2026-10-16', ratioNumerator: 2, ratioDenominator: 1 }],
  })['1W'];
  assert.equal(result.overall.gain, null);
  assert.match(result.rows[0].reason, /predates a corporate action/);
});

test('first purchase in the period works without pre-inception price history', () => {
  const result = run([buy('2026-10-20')], { histories: {} })['1W'];
  assert.equal(result.overall.gain, 100);
  assert.ok(result.overall.percent > 0);
});

test('positions closed before the period are excluded and future trades do not leak in', () => {
  const periods = run([buy('2026-01-01'), { ...buy('2026-02-01'), tradeType: 'SELL' }, buy('2027-01-01')]);
  assert.equal(periods['1W'].rows.length, 0);
  assert.equal(periods['1W'].overall.gain, null);
});
