import { snapshotCache } from './snapshotCache.js';

export async function upsertInstruments(instruments, { fetcher = fetch, cache = snapshotCache } = {}) {
  const response = await fetcher('/api/instruments/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruments }),
  });
  const data = await response.json();
  // Instruments are shared across portfolios. The endpoint returns update counts,
  // so invalidate every cached portfolio, including successful partial imports.
  if (data.updated > 0) cache.invalidateAll();
  if (!response.ok || data.error) throw new Error(data.error || 'Instrument upsert failed');
  return data;
}
