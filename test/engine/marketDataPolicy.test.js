import test from 'node:test';
import assert from 'node:assert/strict';
import { isDelistedStock } from '../../src/lib/marketDataPolicy.js';
import { collectInstrumentPrices } from '../../src/lib/priceService.js';
import { fetchStockMonthlyPrices } from '../../src/lib/historicalPrices.js';
import { collectFundamentals } from '../../src/lib/fundamentalsService.js';
import { collectPortfolioBeta } from '../../src/lib/portfolioBetaService.js';

const delisted = { id: 'uttam', symbol: 'UTTAMVALUE', assetType: 'STOCK', exchange: 'BSE', isin: 'TEST-UTTAM',
  price: '0.001', priceAsOf: new Date('2026-10-01'), priceUpdatedAt: new Date('2026-10-01'), priceSource: 'manual' };
const listed = { ...delisted, id: 'listed', symbol: 'LISTED', price: 100, priceSource: 'yahoo' };

test('delisting policy identifies UTTAMVALUE on either exchange without excluding other instruments', () => {
  for (const exchange of ['NSE', 'BSE']) {
    assert.equal(isDelistedStock({ ...delisted, exchange, symbol: ' uttamvalue ' }), true);
  }
  assert.equal(isDelistedStock(listed), false);
  assert.equal(isDelistedStock({ ...delisted, assetType: 'MF' }), false);
  assert.equal(isDelistedStock(null), false);
});

test('forced and automatic refresh skip delisted quotes, preserve the manual price and original date', async () => {
  for (const options of [{ force: true }, {}, { cacheOnly: true, force: true }]) {
    let calls = 0;
    const result = await collectInstrumentPrices([delisted], options, {
      yahooClient: { quote: async () => { calls++; throw new Error('Must not fetch'); } },
      db: { instrument: { update: async () => { throw new Error('Must not write'); } } },
      fetcher: async () => { throw new Error('Must not fetch AMFI'); },
    });
    assert.equal(calls, 0);
    assert.equal(result.prices.uttam, 0.001);
    assert.equal(result.meta.uttam.refreshSkipped, 'delisted');
    assert.equal(result.meta.uttam.providerSource, 'manual');
    assert.equal(result.meta.uttam.asOf, '2026-10-01');
    assert.equal(result.meta.uttam.stale, true);
  }
});

test('mixed refresh still fetches listed stocks and cannot overwrite delisted prices with provider data', async () => {
  const calls = [], writes = [];
  const asOf = new Date().toISOString().slice(0, 10);
  const result = await collectInstrumentPrices([delisted, listed], { force: true }, {
    yahooClient: { quote: async symbols => {
      calls.push(symbols);
      return ['LISTED.BO', 'UTTAMVALUE.BO'].map(symbol => ({ symbol, regularMarketPrice: 120, regularMarketTime: new Date(asOf) }));
    } },
    db: { instrument: { update: async data => { writes.push(data); } } },
  });
  assert.deepEqual(calls, [['LISTED.BO']]);
  assert.deepEqual(writes.map(row => row.where.id), ['listed']);
  assert.equal(result.prices.listed, 120);
  assert.equal(result.prices.uttam, 0.001);
});

test('delisted historical backfills skip Yahoo for daily and monthly requests', async () => {
  let calls = 0;
  const deps = { yahooClient: { chart: async () => { calls++; throw new Error('Must not fetch'); } } };
  for (const exchange of ['NSE', 'BSE']) {
    for (const daily of [true, false]) {
      assert.deepEqual(await fetchStockMonthlyPrices('UTTAMVALUE', exchange, '2020-01-01', { daily }, deps), {});
    }
  }
  assert.equal(calls, 0);
});

test('analytics skip delisted stocks using database identity even if the client supplies a listed symbol', async () => {
  let calls = 0;
  const forbidden = async () => { calls++; throw new Error('Must not fetch'); };
  const deps = {
    db: { instrument: { findMany: async () => [delisted] } },
    yahooClient: { quote: forbidden, chart: forbidden, quoteSummary: forbidden },
    cache: new Map(),
  };
  const holdings = [{ instrumentId: 'uttam', symbol: 'LISTED', marketValue: 10 }];
  const fundamentals = await collectFundamentals(holdings, { force: true }, deps);
  assert.equal(fundamentals.fundamentals.uttam, null);
  assert.equal(fundamentals.summary.marketCapBreakdown.unknown, 100);
  const beta = await collectPortfolioBeta(holdings, deps);
  assert.equal(beta.beta, null);
  assert.equal(beta.totalValue, 10);
  assert.equal(beta.coveragePct, 0);
  assert.equal(beta.missing[0].reason, 'delisted-skipped');
  assert.equal(calls, 0);
});
