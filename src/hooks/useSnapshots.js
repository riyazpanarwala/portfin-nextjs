'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * useSnapshots — fetches snapshot history for a portfolio.
 * Shared between SnapshotView and PortfolioVsNiftyView.
 *
 * Fix: removed hasFetchedRef guard that permanently blocked reload() after
 * the first fetch.  An AbortController is used instead to cancel in-flight
 * requests on unmount / portfolioId change, which is the right way to
 * prevent duplicate fetches in StrictMode without locking out manual reloads.
 *
 * @param {string|null} portfolioId
 * @param {number}      limit       max snapshots to load (default 100)
 * @returns {{ snapshots, loading, reload }}
 */
export function useSnapshots(portfolioId, limit = 100) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal) => {
    if (!portfolioId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/snapshots?portfolioId=${portfolioId}&limit=${limit}`,
        { signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Return chronologically ascending for charts; callers can reverse if needed
      setSnapshots(
        (data.snapshots || []).sort((a, b) =>
          a.snapshotAt.localeCompare(b.snapshotAt)
        )
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSnapshots([]);
      }
    } finally {
      // Only clear loading if not aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [portfolioId, limit]);

  // Auto-load when portfolioId or limit changes; cancel on cleanup
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Manual reload exposed to callers (e.g. after saving a snapshot)
  // Creates a fresh AbortController so it can't be cancelled by the
  // effect cleanup of the previous auto-load.
  const reload = useCallback(() => {
    const controller = new AbortController();
    load(controller.signal);
    // Return a cleanup in case the caller wants to cancel (rare)
    return () => controller.abort();
  }, [load]);

  return { snapshots, loading, reload };
}
