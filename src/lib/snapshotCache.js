const EMPTY = { rows: [], loading: false, error: null, version: 0 };

export function createSnapshotCache({ fetcher = (...args) => fetch(...args), now = Date.now, ttl = 60000 } = {}) {
  const entries = new Map();
  function entryFor(userId, portfolioId) {
    const key = JSON.stringify([userId, portfolioId]);
    if (!entries.has(key)) entries.set(key, { userId, portfolioId, state: EMPTY, listeners: new Set(), at: 0, limit: 0, complete: false, pending: null, controller: null, generation: 0, retired: false });
    return entries.get(key);
  }
  function publish(entry, patch) {
    entry.state = { ...entry.state, ...patch };
    entry.listeners.forEach(listener => listener());
  }
  function invalidate(entry) {
    entry.generation++;
    entry.controller?.abort();
    entry.pending = null; entry.at = 0; entry.limit = 0; entry.complete = false;
    publish(entry, { rows: [], loading: false, error: null, version: entry.state.version + 1 });
  }
  async function load(entry, limit, { force = false } = {}) {
    if (entry.retired) return;
    if (force) invalidate(entry);
    if (entry.pending) {
      const generation = entry.generation;
      await entry.pending;
      if (generation !== entry.generation || entry.retired) return;
      return load(entry, limit);
    }
    if (entry.limit && now() - entry.at < ttl && (entry.complete || entry.limit >= limit)) return;
    const generation = entry.generation;
    const controller = new AbortController();
    entry.controller = controller;
    const pending = Promise.resolve().then(async () => {
      try {
        if (entry.generation !== generation) return;
        const response = await fetcher(`/api/snapshots?${new URLSearchParams({ portfolioId: entry.portfolioId, limit: String(limit) })}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.snapshots)) throw new Error('Invalid snapshot response');
        if (entry.generation !== generation) return;
        const rows = [...data.snapshots].sort((a, b) => b.snapshotAt.localeCompare(a.snapshotAt));
        entry.at = now(); entry.limit = limit; entry.complete = rows.length < limit;
        publish(entry, { rows, loading: false, error: null });
      } catch (error) {
        if (entry.generation === generation) {
          publish(entry, { rows: [], loading: false, error });
          throw error;
        }
      } finally {
        if (entry.generation === generation) entry.pending = null;
      }
    });
    entry.pending = pending;
    publish(entry, { loading: true, error: null });
    return pending;
  }
  return {
    entryFor, load,
    subscribe(entry, listener) { entry.listeners.add(listener); return () => entry.listeners.delete(listener); },
    invalidatePortfolio(portfolioId) { for (const entry of entries.values()) if (entry.portfolioId === portfolioId) invalidate(entry); },
    invalidateUser(userId) { for (const entry of entries.values()) if (entry.userId === userId) invalidate(entry); },
    clear() { for (const entry of entries.values()) { entry.retired = true; invalidate(entry); } entries.clear(); },
  };
}

export const snapshotCache = createSnapshotCache();
export const emptySnapshotState = EMPTY;
