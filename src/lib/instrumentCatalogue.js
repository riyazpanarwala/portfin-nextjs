import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const DAY = 86_400_000;
const RETRY_DELAY = 5 * 60_000;
const NSE_SERIES = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST', 'SZ']);
const BSE_GROUPS = new Set(['A', 'B', 'E', 'M', 'MS', 'MT', 'P', 'T', 'TS', 'X', 'XT', 'Z', 'ZP']);

// Refresh boundary: 06:30 IST = 01:00 UTC, allowing time after the BOD publication.
export function catalogueDay(time) {
  return Math.floor((time - 3_600_000) / DAY);
}

export function normalizeInstruments(rows, exchange) {
  if (!Array.isArray(rows)) throw new Error(`Invalid ${exchange} instrument feed`);
  const instruments = new Map();
  for (const row of rows) {
    if (!row || row.segment !== `${exchange}_EQ` || row.exchange !== exchange) continue;
    const types = exchange === 'NSE' ? NSE_SERIES : BSE_GROUPS;
    if (!types.has(row.instrument_type)) continue;
    const symbol = String(row.trading_symbol || '').trim().toUpperCase();
    const isin = String(row.isin || '').trim().toUpperCase();
    if (!symbol || !/^IN[EF][A-Z0-9]{9}$/.test(isin) || !row.instrument_key) continue;
    const name = String(row.name || row.short_name || symbol).trim();
    // The master has no explicit ETF flag. Only label fund ISINs with an ETF name;
    // other listed fund units remain searchable without guessing their category.
    const isEtf = isin.startsWith('INF') && /ETF|BEES/i.test(`${name} ${row.short_name || ''} ${symbol}`);
    const item = { s: symbol, n: name, i: isin, e: exchange, t: 'STOCK', c: isEtf ? 'ETF' : '' };
    if (!instruments.has(symbol) || row.instrument_type === 'EQ') instruments.set(symbol, item);
  }
  return [...instruments.values()];
}

export async function downloadCatalogue(fetchImpl = fetch) {
  const groups = await Promise.all(['NSE', 'BSE'].map(async exchange => {
    const response = await fetchImpl(
      `https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json.gz`,
      { cache: 'no-store', signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error(`Upstox ${exchange}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    // Also tolerate a server/proxy that has already decompressed the response.
    const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
    const data = normalizeInstruments(JSON.parse(raw.toString('utf8')), exchange);
    if (data.length < 100) throw new Error(`Upstox ${exchange} catalogue is unexpectedly small`);
    return data;
  }));
  return groups.flat();
}

function validSnapshot(value) {
  return value?.version === 1 && Number.isFinite(value.updatedAt) && value.updatedAt > 0
    && Array.isArray(value.data) && value.data.length > 0
    && ['NSE', 'BSE'].every(exchange => value.data.some(row => row.e === exchange))
    && value.data.every(row => row && typeof row.s === 'string' && row.s
      && typeof row.n === 'string' && typeof row.i === 'string'
      && ['NSE', 'BSE'].includes(row.e) && row.t === 'STOCK' && typeof row.c === 'string');
}

export function createInstrumentCatalogue({
  cachePath = join(process.env.INSTRUMENT_CACHE_DIR || join(process.cwd(), '.cache'), 'upstox-instruments.json'),
  download = downloadCatalogue,
  now = Date.now,
  warn = message => console.warn(message),
} = {}) {
  let snapshot;
  let pending;
  let retryAt = 0;

  async function refresh(force) {
    if (!snapshot) {
      try {
        // Runtime-generated cache, never a bundled deployment asset.
        const saved = JSON.parse(await readFile(/* turbopackIgnore: true */ cachePath, 'utf8'));
        if (validSnapshot(saved)) snapshot = saved;
      } catch (error) {
        if (error.code !== 'ENOENT') warn(`[instruments] Cache read failed: ${error.message}`);
      }
    }
    if (!force && snapshot && catalogueDay(snapshot.updatedAt) >= catalogueDay(now())) return snapshot;
    if (!force && now() < retryAt) {
      if (snapshot) return snapshot;
      throw new Error('Instrument catalogue temporarily unavailable. Please retry shortly.');
    }
    try {
      const data = await download();
      const next = { version: 1, updatedAt: now(), data };
      if (!validSnapshot(next)) throw new Error('Invalid instrument catalogue');
      // Only replace the last successful snapshot after both exchanges validate.
      try {
        await mkdir(dirname(cachePath), { recursive: true });
        const tempPath = `${cachePath}.${randomUUID()}.tmp`;
        await writeFile(tempPath, JSON.stringify(next), 'utf8');
        await rename(tempPath, cachePath);
      } catch (error) {
        warn(`[instruments] Cannot persist cache; using memory: ${error.message}`);
      }
      snapshot = next;
      retryAt = 0;
      return snapshot;
    } catch (error) {
      retryAt = now() + RETRY_DELAY;
      warn(`[instruments] Refresh failed: ${error.message}`);
      if (snapshot && !force) return snapshot;
      throw new Error('Instrument catalogue temporarily unavailable. Please retry shortly.');
    }
  }

  return async function getCatalogue({ force = false } = {}) {
    // Share the disk read/download across simultaneous autocomplete requests.
    if (!pending) pending = refresh(force).finally(() => { pending = null; });
    const result = await pending;
    return { ...result, stale: catalogueDay(result.updatedAt) < catalogueDay(now()) };
  };
}

export const getInstrumentCatalogue = createInstrumentCatalogue();
