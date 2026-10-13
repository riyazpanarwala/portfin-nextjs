import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHoldings, computePortfolioStats, computeCapitalGainsReport, buildMonthlyFlow, generateSchedule111ACsv, generateSchedule112ACsv, simulateTaxHarvesting } from '../../src/lib/store.js';
import { buildSnapshotData, cachedValuationInputs } from '../../src/lib/snapshotValuation.js';
import { FinancialDecimal as D, decimal, decimalField, sumDecimal, lotCost } from '../../src/lib/financialDecimal.js';
import { ENGINE_VERSION, isVerifiedSnapshot } from '../../src/lib/financialRules.js';
import { buildIncomeTaxExport } from '../../src/lib/taxExport.js';
import { Decimal as PrismaDecimal } from '@prisma/client/runtime/index-browser';

const asOf = '2026-10-13';
const trade = (id, tradeType, quantity, price, extra = {}) => ({ id, tradeType, quantity, price, instrumentId: 'nse', symbol: 'TEST',
  exchange: 'NSE', assetType: 'STOCK', taxCategory: 'EQUITY_ELIGIBLE', tradeDate: tradeType === 'BUY' ? '2026-04-01' : '2026-10-10', ...extra });
const calculate = (rows, prices = {}, options = {}) => computeHoldings(rows, prices, { asOf, ...options });

test('decimal configuration is isolated from Prisma and decimal money does not drift', () => {
  assert.equal(decimal('0.1').plus('0.2').toFixed(), '0.3');
  assert.equal(decimal('1.005').toFixed(2), '1.01');
  assert.equal(decimal('-1.005').toFixed(2), '-1.01');
  assert.equal(D.precision, 40);
  assert.equal(PrismaDecimal.precision, 20);
});

test('fractional FIFO purchases close exactly without phantom balances or false gains', () => {
  const [h] = calculate([trade('b1', 'BUY', '0.1', '0.1'), trade('b2', 'BUY', '0.2', '0.1'), trade('s', 'SELL', '0.3', '0.1')]);
  assert.equal(h.qty, 0);
  assert.equal(h.realizedGain, 0);
  assert.equal(h.unmatchedSellQty, 0);
  assert.deepEqual(h.lots, []);
  assert.equal(h.hasDataError, false);
  assert.equal(h.sells[0].exact.qty, '0.3');
  assert.equal(h.exact.totalEverInvested, '0.03');
  assert.equal(computePortfolioStats([h]).totalGain, 0);
});

test('partial FIFO sales conserve separate economic and deductible fees across multiple purchase prices', () => {
  const rows = [
    trade('b1', 'BUY', '3', '0.1', { brokerage: '0.1', taxBrokerage: '0.05' }),
    trade('b2', 'BUY', '2', '0.15', { brokerage: '0.02', taxBrokerage: '0.01', tradeDate: '2026-05-01' }),
    trade('s', 'SELL', '3.5', '0.2', { brokerage: '0.07', taxBrokerage: '0.035' }),
  ];
  const original = JSON.stringify(rows);
  const [h] = calculate(rows, { nse: '0.2' });
  assert.equal(h.exact.qty, '1.5');
  assert.equal(h.exact.invested, '0.24');
  assert.equal(h.exact.marketValue, '0.3');
  assert.equal(h.exact.realizedGain, '0.15');
  assert.equal(h.exact.unrealizedGain, '0.06');
  assert.equal(h.exact.totalGain, '0.21');
  const matched = h.sells[0].matchedLots;
  assert.equal(sumDecimal(matched, m => decimalField(m, 'costBasis')).toFixed(), '0.48');
  assert.equal(sumDecimal(matched, m => decimalField(m, 'sellFee')).toFixed(), '0.07');
  assert.equal(sumDecimal(matched, m => decimalField(m, 'expenditure')).toFixed(), '0.035');
  const report = computeCapitalGainsReport([h], { fy: '2026-27' });
  assert.equal(report.exact.grossStcg, '0.2375');
  assert.equal(report.exact.totalRealized, '0.15');
  assert.equal(report.exact.stcgTax, '0.0475');
  assert.equal(report.exact.totalTax, '0.0494');
  assert.equal(JSON.stringify(rows), original);
});

test('recurring per-unit costs conserve the full purchase cost on the final sale', () => {
  const rows = [trade('b', 'BUY', '3', '0.1', { brokerage: '0.01', taxBrokerage: '0.01' }),
    ...[1, 2, 3].map(day => trade(`s${day}`, 'SELL', '1', '0.2', { tradeDate: `2026-10-0${day}`, brokerage: '0.01', taxBrokerage: '0.01' }))];
  const [h] = calculate(rows);
  assert.equal(h.exact.realizedGain, '0.26');
  assert.equal(h.qty, 0);
  assert.equal(sumDecimal(h.sells.flatMap(s => s.matchedLots), m => decimalField(m, 'costBasis')).toFixed(), '0.31');
  const [partial] = calculate(rows.slice(0, 2));
  assert.equal(sumDecimal(partial.sells[0].matchedLots, m => decimalField(m, 'costBasis')).plus(lotCost(partial.lots[0])).toFixed(), '0.31');
});

test('large ledger quantities retain micro-units through FIFO and portfolio aggregation', () => {
  const [h] = calculate([trade('b', 'BUY', '9007199254.740993', '1.0000'), trade('s', 'SELL', '0.000001', '1.0000')], { nse: '1' });
  assert.equal(h.exact.qty, '9007199254.740992');
  assert.equal(h.exact.invested, '9007199254.740992');
  assert.equal(h.exact.realizedGain, '0');
  const holdings = [h, ...calculate([trade('b2', 'BUY', '0.000001', '1', { instrumentId: 'bse', exchange: 'BSE' })], { bse: '1' })];
  assert.equal(computePortfolioStats(holdings).exact.totalValue, '9007199254.740993');
  assert.equal(computePortfolioStats(JSON.parse(JSON.stringify(holdings))).exact.totalValue, '9007199254.740993');
});

test('split/reverse split and bonus replay preserve acquisition costs and leave the ledger immutable', () => {
  const rows = [trade('b', 'BUY', '3', '0.1', { brokerage: '0.01', taxBrokerage: '0.01' })];
  const original = JSON.stringify(rows);
  const action = { id: 'split', instrumentId: 'nse', exDate: '2026-05-01', actionType: 'SPLIT', ratioNumerator: '7', ratioDenominator: '3' };
  const [h] = calculate(rows, {}, { corporateActions: [action] });
  assert.equal(h.exact.qty, '7');
  assert.equal(h.exact.invested, '0.31');
  assert.equal(h.unrealizedGain, 0);
  const [reversed] = calculate(rows, {}, { corporateActions: [action, { ...action, id: 'reverse', actionType: 'REVERSE_SPLIT', exDate: '2026-06-01', ratioNumerator: '3', ratioDenominator: '7' }] });
  assert.equal(reversed.exact.qty, '3');
  assert.equal(reversed.exact.invested, '0.31');
  const [bonus] = calculate(rows, {}, { corporateActions: [{ ...action, actionType: 'BONUS', ratioNumerator: '1', ratioDenominator: '3' }] });
  assert.equal(bonus.exact.qty, '4');
  assert.equal(bonus.exact.invested, '0.31');
  assert.equal(bonus.lots[1].costBasis, 0);
  assert.equal(JSON.stringify(rows), original);
});

test('a split with a recurring adjusted sale price conserves original proceeds and creates no false gain', () => {
  const rows = [trade('b', 'BUY', '1', '1', { tradeDate: '2024-04-01' }), trade('s', 'SELL', '1', '1', { tradeDate: '2025-05-01' })];
  const [h] = calculate(rows, {}, { corporateActions: [{ id: 'split', instrumentId: 'nse', exDate: '2026-05-01', actionType: 'SPLIT', ratioNumerator: '3', ratioDenominator: '1' }] });
  assert.equal(h.qty, 0);
  assert.equal(h.realizedGain, 0);
  assert.equal(h.stats.winCount, 0);
  assert.equal(h.stats.lossCount, 0);
  assert.equal(h.sells[0].exact.grossProceeds, '1');
  assert.equal(h.stats.totalSellProceeds, 1);
});

test('snapshots retain exact cached prices, round half cents once, and support both verified engine versions', () => {
  const { prices, meta } = cachedValuationInputs([{ id: 'nse', price: decimal('1.0050'), priceAsOf: new Date(asOf), priceSource: 'test' }]);
  assert.equal(prices.nse, '1.005');
  const snapshot = buildSnapshotData([trade('b', 'BUY', '1', '1.0050')], prices, meta, { asOf, revision: 3 });
  assert.equal(snapshot.totalValue, '1.01');
  assert.equal(snapshot.totalInvested, '1.01');
  assert.equal(snapshot.totalGain, '0.00');
  assert.equal(snapshot.engineVersion, ENGINE_VERSION);
  assert.equal(isVerifiedSnapshot(snapshot), true);
  assert.equal(isVerifiedSnapshot({ ...snapshot, engineVersion: 'fifo-v2' }), true);
  assert.equal(isVerifiedSnapshot({ ...snapshot, stale: true }), false);
  assert.equal(isVerifiedSnapshot({ ...snapshot, engineVersion: 'unknown' }), false);
});

test('monthly totals and tax exports use decimal half-up rounding at export boundaries', () => {
  const rows = [trade('b', 'BUY', '1', '0.1'), trade('s', 'SELL', '1', '1.1050')];
  assert.equal(buildMonthlyFlow([trade('b1', 'BUY', '1', '0.1'), trade('b2', 'BUY', '1', '0.2')])[0].amount, 0.3);
  const h = calculate(rows);
  const report = computeCapitalGainsReport(h, { fy: '2026-27' });
  assert.equal(report.exact.grossStcg, '1.005');
  assert.match(generateSchedule111ACsv(report), /Net Short-Term Capital Gain u\/s 111A:,1\.01/);
  assert.equal(buildIncomeTaxExport(h, { fy: '2026-27', classifications: { TEST: 'equity' }, trades: rows }).gains[0].gain, 1.01);
  const longReport = computeCapitalGainsReport(calculate([{ ...rows[0], tradeDate: '2024-04-01' }, rows[1]]), { fy: '2026-27' });
  assert.match(generateSchedule112ACsv(longReport), /,1\.01,0\.00,1\.01/);
});

test('zero quantities are no-ops, invalid values fail explicitly, and absent prices retain exact cost', () => {
  assert.deepEqual(calculate([trade('zero', 'BUY', '0', '1'), trade('zero-sell', 'SELL', '0', '1')]), []);
  for (const quantity of ['-1', 'NaN', 'Infinity']) assert.throws(() => calculate([trade('bad', 'BUY', quantity, '1')]), /Invalid trade/);
  const [h] = calculate([trade('b', 'BUY', '3', '0.1', { brokerage: '0.01' })]);
  assert.equal(h.priceAvailable, false);
  assert.equal(h.exact.marketValue, '0.31');
  assert.equal(h.unrealizedGain, 0);
});

test('harvesting executes exact FIFO quantities and consumes residual lot costs', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(`${asOf}T06:00:00Z`) });
  const h = calculate([trade('b', 'BUY', '3', '0.1', { brokerage: '0.01', taxBrokerage: '0.01', tradeDate: '2024-04-01' })], { nse: '0.2' });
  const report = computeCapitalGainsReport(h, { fy: '2026-27' });
  const simulation = simulateTaxHarvesting(h, report, { 'nse_2024-04-01_0': { selected: true, harvestRatio: 1 } });
  assert.equal(simulation.orders[0].unitsToSell, 3);
  assert.equal(simulation.orders[0].exact.costBasis, '0.31');
  assert.equal(simulation.orders[0].exact.gainOrLoss, '0.29');
  assert.equal(simulation.simulated.exact.harvestedLtcg, '0.29');
  assert.equal(simulation.impact.exact.futureLtcgTaxShielded, '0.03625');
});
