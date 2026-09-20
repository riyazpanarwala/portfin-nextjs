import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHoldings, computeCapitalGainsReport } from '../../src/lib/store.js';
import { buildIncomeTaxExport, classifyForIncomeTax } from '../../src/lib/taxExport.js';

const trade = (tradeType, tradeDate, price, quantity = 10, symbol = 'TEST') => ({ tradeType, tradeDate, price, quantity, symbol, name: 'Synthetic equity', isin: 'TEST00000001', exchange: 'NSE', assetType: 'STOCK' });
const exportTrades = (trades, options = {}) => buildIncomeTaxExport(computeHoldings(trades), { fy: '2026-27', ...options });

test('empty FY, required FY, and exact contract shape', () => {
  const result = exportTrades([trade('BUY', '2026-04-01', 100)]);
  assert.deepEqual(result.gains, []);
  assert.equal(result.reconciliation.transactionCount, 0);
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'source', 'financialYear', 'generatedAt', 'summary', 'gains', 'warnings', 'reconciliation']);
  assert.throws(() => exportTrades([], { fy: 'ALL' }));
  assert.throws(() => exportTrades([], { fy: '2026-28' }));
});

test('confirmed equity maps FIFO short and long lots without changing tax report', () => {
  const holdings = computeHoldings([trade('BUY', '2024-04-01', 100), trade('BUY', '2026-04-01', 150), trade('SELL', '2026-07-01', 200, 20)]);
  const before = structuredClone(holdings);
  const report = computeCapitalGainsReport(holdings, { fy: '2026-27' });
  const data = buildIncomeTaxExport(holdings, { fy: '2026-27', classifications: { TEST: 'equity' } });
  assert.deepEqual(data.gains.map(g => g.kind), ['112A', '111A']);
  assert.equal(data.summary.section112A.gain, 1000);
  assert.equal(data.summary.section111A.gain, 500);
  assert.equal(data.reconciliation.transactionCount, 1);
  assert.equal(data.reconciliation.gainCount, 2);
  assert.deepEqual(holdings, before);
  assert.deepEqual(computeCapitalGainsReport(holdings, { fy: '2026-27' }), report);
  assert.equal(data.reconciliation.totalGain, report.totalRealized);
});

test('losses remain negative and summary stores absolute loss, without netting', () => {
  const data = exportTrades([trade('BUY', '2026-04-01', 200), trade('SELL', '2026-07-01', 100)], { classifications: { TEST: 'equity' } });
  assert.equal(data.gains[0].gain, -1000);
  assert.equal(data.summary.section111A.loss, 1000);
  assert.equal(data.reconciliation.reviewCount, 1);
});

test('multiple instruments, FY filtering and deterministic lot identifiers', () => {
  const trades = [trade('BUY', '2024-04-01', 100), trade('SELL', '2025-07-01', 150, 5), trade('SELL', '2026-07-01', 200, 5), trade('BUY', '2026-04-01', 10, 2, 'SECOND'), trade('SELL', '2026-08-01', 20, 2, 'SECOND')];
  const first = exportTrades(trades);
  assert.equal(first.gains.length, 2);
  assert.deepEqual(first.gains, exportTrades(trades).gains);
  assert.equal(exportTrades(trades, { fy: '2025-26' }).gains.length, 1);
  assert.ok(first.gains.every(g => g.kind === 'review' && !g.confirmed));
});

test('fund eligibility is never inferred from MF or its name', () => {
  const trades = [trade('BUY', '2024-04-01', 100), trade('SELL', '2026-07-01', 200)].map(t => ({ ...t, assetType: 'MF', exchange: 'AMFI', name: 'Equity debt gold fund' }));
  assert.equal(exportTrades(trades).gains[0].kind, 'review');
  assert.equal(exportTrades(trades, { classifications: { TEST: 'otherSTCG' } }).gains[0].kind, 'otherSTCG');
  assert.equal(exportTrades(trades, { classifications: { TEST: '112' } }).gains[0].kind, '112');
});

test('anniversary and grandfathering mismatches require review', () => {
  assert.equal(classifyForIncomeTax({ date: '2026-04-01', assetType: 'STOCK' }, { buyDate: '2025-04-01', taxType: 'LTCG' }, 'equity').kind, 'review');
  assert.equal(classifyForIncomeTax({ date: '2026-04-01', assetType: 'STOCK' }, { buyDate: '2017-04-01', taxType: 'LTCG' }, 'equity').kind, 'review');
});

test('adjusted corporate-action lots retain the existing FIFO cost and quantity', () => {
  // PortFin corporate actions update trade quantity/price in place before FIFO.
  const data = exportTrades([trade('BUY', '2024-04-01', 50, 20), trade('SELL', '2026-07-01', 100, 20)], { classifications: { TEST: 'equity' } });
  assert.equal(data.gains[0].quantity, 20);
  assert.equal(data.gains[0].costBasis, 1000);
  assert.equal(data.gains[0].acquired, '2024-04-01');
});

test('separate portfolio reports have no account secrets; unmatched sales warn', () => {
  const trades = [trade('BUY', '2026-04-01', 100), trade('SELL', '2026-07-01', 200)];
  const data = exportTrades(trades.map(t => ({ ...t, portfolioId: 'private-account', password: 'secret' })));
  assert.ok(!JSON.stringify(data).includes('private-account'));
  assert.ok(!JSON.stringify(data).includes('secret'));
  const holdings = computeHoldings(trades);
  holdings[0].hasDataError = true;
  assert.equal(buildIncomeTaxExport(holdings, { fy: '2026-27' }).warnings.length, 1);
});

test('raw trade reconciliation catches fully omitted sells and loading truncation', () => {
  const missing = buildIncomeTaxExport([], { fy: '2026-27', trades: [trade('SELL', '2026-07-01', 200)] });
  assert.ok(missing.warnings.some(w => w.includes('Sale quantities')));
  const capped = buildIncomeTaxExport([], { fy: '2026-27', trades: Array.from({ length: 1000 }, () => trade('BUY', '2026-04-01', 100)) });
  assert.ok(capped.warnings.some(w => w.includes('API limit')));
});

test('fractional FIFO values are rounded only in the export', () => {
  const holdings = computeHoldings([trade('BUY', '2026-04-01', 1.1234, 1.234567), trade('SELL', '2026-07-01', 2.3456, 1.234567)]);
  const original = holdings[0].sells[0].matchedLots[0].gain;
  const data = buildIncomeTaxExport(holdings, { fy: '2026-27', classifications: { TEST: 'equity' } });
  assert.equal(data.gains[0].gain, Number(original.toFixed(2)));
  assert.equal(holdings[0].sells[0].matchedLots[0].gain, original);
  assert.equal(data.gains[0].quantity, 1.234567);
});
