'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useSnapshots(portfolioId, limit = 200) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    if (!portfolioId) {
      setSnapshots([]);
      setLoading(false);
      return;
    }

    // Abort previous request
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `/api/snapshots?portfolioId=${portfolioId}&limit=${limit}`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!controller.signal.aborted) {
        setSnapshots(
          [...(data.snapshots || [])].sort((a, b) =>
            b.snapshotAt.localeCompare(a.snapshotAt)
          )
        );
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        setSnapshots([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [portfolioId, limit]);

  useEffect(() => {
    load();

    return () => {
      controllerRef.current?.abort();
    };
  }, [load]);

  return {
    snapshots,
    loading,
    error,
    reload: load,
  };
}
