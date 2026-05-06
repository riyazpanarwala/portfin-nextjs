'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useSnapshots — fetches snapshot history for a portfolio.
 * Shared between SnapshotView and PortfolioVsNiftyView to avoid duplicate fetch logic.
 *
 * @param {string|null} portfolioId
 * @param {number}      limit       max snapshots to load (default 100)
 * @returns {{ snapshots, loading, reload }}
 */
export function useSnapshots(portfolioId, limit = 100) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasFetchedRef = useRef(false);

  const load = useCallback(async () => {
    if (!portfolioId || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/snapshots?portfolioId=${portfolioId}&limit=${limit}`);
      const data = await res.json();
      // Return chronologically ascending for charts; callers can reverse if needed
      setSnapshots((data.snapshots || []).sort((a, b) => a.snapshotAt.localeCompare(b.snapshotAt)));
    } catch {
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [portfolioId, limit]);

  useEffect(() => { load(); }, [load]);

  return { snapshots, loading, reload: load };
}
