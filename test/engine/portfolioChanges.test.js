import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioChanges, periodStart, portfolioHistoryStart } from '../../src/lib/portfolioChanges.js';

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

test('delisted stock is explicitly excluded without blocking totals or diluting percentage returns in any period', () => {
  const historyForAllPeriods = Object.fromEntries(['2025-10-23', '2026-07-23', '2026-09-23', '2026-10-16', '2026-10-22'].map(date => [date, { price: 100, asOf: date }]));
  const trades = [buy('2020-01-01'), buy('2020-01-01', 5, 100, 'B', 'MF')];
  const inputs = { histories: { A: historyForAllPeriods, B: historyForAllPeriods },
    prices: { A: 110, B: 90, UTTAMVALUE: 0.17 },
    meta: { A: { asOf: '2026-10-23' }, B: { asOf: '2026-10-23' }, UTTAMVALUE: { asOf: '2026-10-21' } } };
  const baseline = run(trades, inputs);
  const withDelisted = run([...trades, buy('2020-01-01', 10000, 10, 'UTTAMVALUE')], inputs);
  for (const period of Object.keys(baseline)) {
    const result = withDelisted[period];
    for (const key of ['overall', 'mf', 'stocks']) {
      assert.equal(result[key].gain, baseline[period][key].gain);
      assert.equal(result[key].percent, baseline[period][key].percent);
      assert.equal(result[key].count, baseline[period][key].count);
      assert.equal(result[key].covered, baseline[period][key].covered);
    }
    assert.equal(result.stocks.excluded, 1);
    assert.equal(result.overall.excluded, 1);
    assert.equal(result.mf.excluded, 0);
    const row = result.rows.find(r => r.symbol === 'UTTAMVALUE');
    assert.equal(row.excluded, true);
    assert.equal(row.gain, null);
    assert.match(row.reason, /Delisted stock/);
  }
});

test('an unpriced listed stock still blocks totals when a delisted stock is excluded', () => {
  const result = run([buy('2020-01-01'), buy('2020-01-01', 10, 100, 'MISSING'), buy('2020-01-01', 10, 100, 'UTTAMVALUE')])['1W'];
  assert.equal(result.stocks.gain, null);
  assert.equal(result.overall.gain, null);
  assert.equal(result.stocks.count, 2);
  assert.equal(result.stocks.covered, 1);
  assert.equal(result.stocks.excluded, 1);
  assert.equal(result.rows.find(row => row.symbol === 'MISSING').excluded, undefined);
});

test('a portfolio containing only delisted stocks has no eligible return rather than an invented zero', () => {
  const result = run([buy('2020-01-01', 10, 100, 'UTTAMVALUE')])['1W'];
  assert.equal(result.stocks.gain, null);
  assert.equal(result.stocks.percent, null);
  assert.equal(result.stocks.count, 0);
  assert.equal(result.stocks.excluded, 1);
});

test('multi-year periods preserve calendar anniversaries and clamp leap days', () => {
  for (const years of [2, 3, 5, 10]) {
    assert.equal(periodStart('2026-10-23', `${years}Y`), `${2026 - years}-10-23`);
    assert.equal(periodStart('2024-02-29', `${years}Y`), `${2024 - years}-02-28`);
  }
  assert.equal(periodStart('2026-10-23', 'Max', '2000-01-01'), '1999-12-31');
});

test('each multi-year change uses its own historical price boundary', () => {
  const histories = { A: Object.fromEntries([[2, 100], [3, 80], [5, 50], [10, 25]].map(([years, price]) => {
    const asOf = `${2026 - years}-10-23`;
    return [asOf, { asOf, price }];
  })) };
  const periods = run([buy('2010-01-01', 10, 10)], { histories, prices: { A: 120 } });
  for (const [years, price] of [[2, 100], [3, 80], [5, 50], [10, 25]]) {
    const result = periods[`${years}Y`];
    assert.equal(result.overall.gain, (120 - price) * 10);
    assert.equal(result.overall.percent, (120 - price) / price * 100);
    assert.equal(result.rows[0].baselinePriceDate, `${2026 - years}-10-23`);
  }
});

test('Max includes first-day fees and all realized gains, even before the ten-year window', () => {
  const trades = [
    buy('2014-01-01', 10, 100, 'B', 'MF'),
    { ...buy('2015-01-01', 10, 120, 'B', 'MF'), tradeType: 'SELL' },
    { ...buy('2000-01-01', 10, 100), brokerage: 10 },
    buy('2027-01-01', 10, 1000),
  ];
  const result = buildPortfolioChanges({ trades, histories: {}, prices: { A: 110 }, meta: { A: { asOf: '2026-10-23' } }, asOf: '2026-10-23' });
  assert.equal(result.inceptionDate, '2000-01-01');
  assert.equal(result.periods.Max.overall.gain, 290);
  assert.equal(result.periods.Max.stocks.gain, 90);
  assert.equal(result.periods.Max.mf.gain, 200);
  assert.equal(result.periods.Max.rows[0].start, '1999-12-31');
  assert.equal(result.periods.Max.overall.covered, 2);
  assert.ok(result.periods.Max.overall.percent > 0);
});

test('Max excludes delisted history from its inception date and capital weighting', () => {
  const base = [buy('2020-01-01')];
  const withDelisted = [...base, buy('2000-01-01', 10000, 100, 'UTTAMVALUE')];
  assert.equal(run(withDelisted).Max.overall.gain, run(base).Max.overall.gain);
  assert.equal(run(withDelisted).Max.overall.percent, run(base).Max.overall.percent);
  assert.equal(run(withDelisted).Max.rows.find(r => r.symbol === 'A').start, '2019-12-31');
});

test('extended history covers ten-year windows but avoids fetching unused pre-inception data', () => {
  assert.equal(portfolioHistoryStart([buy('2000-01-01')], '2026-10-23'), '2016-10-13');
  assert.equal(portfolioHistoryStart([buy('2020-01-01')], '2026-10-23'), '2019-12-22');
  assert.equal(portfolioHistoryStart([buy('2020-01-01'), buy('2000-01-01', 1, 100, 'UTTAMVALUE'), buy('2027-01-01')], '2026-10-23'), '2019-12-22');
});

test('periods longer than the portfolio history use inception without inflating cash-flow-weighted returns', () => {
  const periods = run([buy('2025-10-01')]);
  for (const period of ['2Y', '3Y', '5Y', '10Y']) {
    assert.equal(periods[period].rows[0].start, '2025-09-30');
    assert.equal(periods[period].overall.gain, periods.Max.overall.gain);
    assert.equal(periods[period].overall.percent, periods.Max.overall.percent);
  }
});
