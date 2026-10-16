import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMFHistoricalNAV } from '../../src/lib/historicalPrices.js';

test('daily historical NAV joins only the documented direct-growth predecessor before the rename', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    if (url.includes('NAVAll')) return { ok: true, text: async () => 'Scheme Code;ISIN;Net Asset Value;Date\n151130;INF917K01QA1;98.42;15-Oct-2026' };
    const data = url.endsWith('/129220')
      ? [{ date: '24-11-2022', nav: '51.2176' }, { date: '01-10-2018', nav: '25.60' }, { date: '28-11-2022', nav: '999' }]
      : [{ date: '28-11-2022', nav: '51.5' }, { date: '29-11-2022', nav: '51.6' }];
    return { ok: true, json: async () => ({ data }) };
  });
  const daily = await fetchMFHistoricalNAV('INF917K01QA1', '2018-01-01', { daily: true });
  assert.equal(daily['2018-10-01'].price, 25.6);
  assert.equal(daily['2018-10-01'].source, 'mfapi-predecessor-129220');
  assert.equal(daily['2022-11-28'].price, 51.5);
  assert.equal(daily['2022-11-29'].price, 51.6);
  const monthly = await fetchMFHistoricalNAV('INF917K01QA1', '2018-01-01');
  assert.equal(monthly['2022-11'].price, 51.6);
  assert.equal(monthly['2018-10'].price, 25.6);
  requests.length = 0;
  await fetchMFHistoricalNAV('INF917K01QA1', '2023-01-01', { daily: true });
  assert.ok(!requests.some(url => url.endsWith('/129220')));
});
