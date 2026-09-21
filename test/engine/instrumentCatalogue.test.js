import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { catalogueDay, createInstrumentCatalogue, downloadCatalogue, normalizeInstruments } from '../../src/lib/instrumentCatalogue.js';

const data = ['NSE', 'BSE'].map(e => ({ s: 'NEWIPO', n: 'New Listing', i: 'INE123A01012', e, t: 'STOCK', c: '' }));
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'portfin-catalogue-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cachePath = join(dir, 'catalogue.json');
  return { cachePath, get: createInstrumentCatalogue({ cachePath, warn: () => {}, ...options }) };
}

test('normalizes stocks, SME listings and ETFs while excluding bonds and derivatives', () => {
  const stock = { segment: 'NSE_EQ', exchange: 'NSE', instrument_type: 'EQ', trading_symbol: 'newipo', name: 'New IPO', isin: 'INE123A01012', instrument_key: 'NSE_EQ|INE123A01012' };
  const rows = [stock, stock, { ...stock, trading_symbol: 'SME', instrument_type: 'SM' },
    { ...stock, trading_symbol: 'GOLDBEES', isin: 'INF204KB17I5', name: 'Gold ETF' },
    { ...stock, trading_symbol: 'BOND', instrument_type: 'N1' },
    { ...stock, trading_symbol: 'FUTURE', segment: 'NSE_FO' },
    { ...stock, trading_symbol: 'INVALID', isin: '' }, null];
  const result = normalizeInstruments(rows, 'NSE');
  assert.deepEqual(result.map(row => row.s), ['NEWIPO', 'SME', 'GOLDBEES']);
  assert.equal(result[2].c, 'ETF');
  assert.equal(result[2].t, 'STOCK');
  assert.equal(normalizeInstruments([{ ...stock, exchange: 'BSE', segment: 'BSE_EQ', instrument_type: 'A' }], 'BSE').length, 1);
});

test('daily boundary is 06:30 IST', () => {
  assert.equal(catalogueDay(Date.parse('2026-09-21T00:59:59Z')), catalogueDay(Date.parse('2026-09-20T01:00:00Z')));
  assert.notEqual(catalogueDay(Date.parse('2026-09-21T00:59:59Z')), catalogueDay(Date.parse('2026-09-21T01:00:00Z')));
});

test('coalesces downloads, persists across restarts, and discovers next-day listings', async t => {
  let time = Date.parse('2026-09-21T02:00:00Z');
  let calls = 0;
  const download = async () => { calls++; return calls === 1 ? data : [...data, { ...data[0], s: 'NEWETF' }]; };
  const { get, cachePath } = await setup(t, { now: () => time, download });
  await Promise.all([get(), get(), get()]);
  assert.equal(calls, 1);
  const restarted = createInstrumentCatalogue({ cachePath, now: () => time, download });
  assert.equal((await restarted()).data.length, 2);
  assert.equal(calls, 1);
  time += 86_400_000;
  assert.equal((await restarted()).data.at(-1).s, 'NEWETF');
  assert.equal(calls, 2);
});

test('failed refresh retains disk snapshot and retries only after backoff', async t => {
  let time = Date.parse('2026-09-21T02:00:00Z');
  let calls = 0;
  const { get, cachePath } = await setup(t, { now: () => time, download: async () => {
    if (++calls > 1) throw new Error('offline');
    return data;
  } });
  await get();
  const saved = await readFile(cachePath, 'utf8');
  time += 86_400_000;
  assert.equal((await get()).stale, true);
  await get();
  assert.equal(calls, 2);
  assert.equal(await readFile(cachePath, 'utf8'), saved);
  time += 300_001;
  await get();
  assert.equal(calls, 3);
  await assert.rejects(get({ force: true }), /temporarily unavailable/);
});

test('cold failures surface explicitly and a corrupt cache can recover', async t => {
  let calls = 0;
  const { get, cachePath } = await setup(t, { download: async () => { calls++; throw new Error('offline'); } });
  await writeFile(cachePath, '{broken');
  await assert.rejects(get(), /temporarily unavailable/);
  await assert.rejects(get(), /temporarily unavailable/);
  assert.equal(calls, 1);
  const recovered = createInstrumentCatalogue({ cachePath, download: async () => data, warn: () => {} });
  assert.equal((await recovered()).data.length, 2);
});

test('download accepts gzip and plain JSON, rejects incomplete exchange feeds', async () => {
  const feed = exchange => Array.from({ length: 100 }, (_, i) => ({ segment: `${exchange}_EQ`, exchange,
    trading_symbol: `STOCK${i}`, name: 'Stock', isin: 'INE123A01012', instrument_key: `${exchange}|${i}`,
    instrument_type: exchange === 'NSE' ? 'EQ' : 'A' }));
  const fetchMock = async url => {
    const exchange = url.includes('/NSE.') ? 'NSE' : 'BSE';
    const body = JSON.stringify(feed(exchange));
    return new Response(exchange === 'NSE' ? gzipSync(body) : body);
  };
  assert.equal((await downloadCatalogue(fetchMock)).length, 200);
  await assert.rejects(downloadCatalogue(async () => new Response('[]')), /unexpectedly small/);
  await assert.rejects(downloadCatalogue(async () => new Response('', { status: 503 })), /HTTP 503/);
});
