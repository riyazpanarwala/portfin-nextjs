import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSaleTaxEligibility } from '../../src/lib/saleTaxConfirmation.js';
import { flattenTrade } from '../../src/lib/apiHelpers.js';
import { computeHoldings, computeCapitalGainsReport } from '../../src/lib/store.js';
import { buildIncomeTaxExport } from '../../src/lib/taxExport.js';

const session = { userId: 'owner' };
const input = { portfolioId: 'portfolio', saleIds: ['sale'], confirmed: true };
function database(sales = [{ id: 'sale', sttEligible: null, taxCategory: null, instrument: { assetType: 'STOCK', taxCategory: 'UNKNOWN' } }]) {
  const writes = [];
  const db = {
    portfolio: { findFirst: async () => ({ id: 'portfolio' }), updateMany: async () => ({ count: 1 }), update: async args => writes.push(args) },
    trade: { findMany: async () => sales, updateMany: async args => { writes.push(args); return { count: sales.length }; } },
    $transaction: async callback => callback(db),
  };
  return { db, writes };
}

test('confirmation requires an explicit assertion, owned portfolio and valid unique sale IDs', async () => {
  for (const body of [null, {}, { ...input, confirmed: false }, { ...input, saleIds: [] }, { ...input, saleIds: ['sale', 'sale'] }]) {
    const { db, writes } = database();
    await assert.rejects(confirmSaleTaxEligibility(db, session, body), error => error.status === 400);
    assert.equal(writes.length, 0);
  }
  const { db, writes } = database();
  db.portfolio.findFirst = async () => null;
  await assert.rejects(confirmSaleTaxEligibility(db, session, input), error => error.status === 404);
  assert.equal(writes.length, 0);
});

test('missing sales and known ineligibility cannot be bulk-confirmed', async () => {
  for (const rows of [[], [{ sttEligible: false, instrument: { assetType: 'STOCK' } }], [{ taxCategory: 'OTHER', instrument: { assetType: 'MF' } }], [{ instrument: { assetType: 'MF', taxCategory: 'OTHER' } }]]) {
    const { db, writes } = database(rows);
    await assert.rejects(confirmSaleTaxEligibility(db, session, input), error => [400, 409].includes(error.status));
    assert.equal(writes.length, 0);
  }
});

test('confirmation persists only tax fields and increments the trade-loading revision', async () => {
  const { db, writes } = database();
  assert.equal((await confirmSaleTaxEligibility(db, session, input)).confirmed, 1);
  assert.equal(writes[0].data.sttEligible, true);
  assert.equal(writes[0].data.taxCategory, 'EQUITY_ELIGIBLE');
  assert.ok(writes[0].data.taxEligibilityConfirmedAt instanceof Date);
  assert.deepEqual(Object.keys(writes[0].data).sort(), ['sttEligible', 'taxCategory', 'taxEligibilityConfirmedAt']);
  assert.equal(writes[0].where.portfolioId, 'portfolio');
  assert.equal(writes[0].where.tradeType, 'SELL');
  assert.equal(writes[0].where.sttEligible, null);
  assert.equal(writes[1].data.revision.increment, 1);
});

test('saved sale confirmation survives API loading and classifies a fund without changing its instrument', () => {
  const instrument = { symbol: 'FUND', name: 'Fund', assetType: 'MF', exchange: 'AMFI', taxCategory: 'UNKNOWN' };
  const buy = { id: 'buy', instrumentId: 'fund', portfolioId: 'portfolio', instrument, tradeType: 'BUY', quantity: '10', price: '100', tradeDate: new Date('2024-04-01'), createdAt: new Date('2024-04-01') };
  const sell = { ...buy, id: 'sale', tradeType: 'SELL', price: '200', tradeDate: new Date('2026-09-01'), sttEligible: true, taxCategory: 'EQUITY_ELIGIBLE', taxEligibilityConfirmedAt: new Date() };
  const holdings = computeHoldings([buy, sell].map(flattenTrade));
  assert.equal(computeCapitalGainsReport(holdings, { fy: '2026-27' }).taxEstimateAvailable, true);
  assert.equal(buildIncomeTaxExport(holdings, { fy: '2026-27' }).gains[0].kind, '112A');
  assert.equal(instrument.taxCategory, 'UNKNOWN');
});
