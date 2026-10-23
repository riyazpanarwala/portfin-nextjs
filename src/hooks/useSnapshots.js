'use client';

import { useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { isVerifiedSnapshot } from '@/lib/financialRules';
import { snapshotCache, emptySnapshotState } from '@/lib/snapshotCache';
import { useAuth } from '@/context/AuthContext';

export function useSnapshots(portfolioId, limit = 200) {
  const { user } = useAuth();
  const userId = user?.id;
  const entry = useMemo(() => userId && portfolioId ? snapshotCache.entryFor(userId, portfolioId) : null, [userId, portfolioId]);
  const subscribe = useCallback(listener => entry ? snapshotCache.subscribe(entry, listener) : () => {}, [entry]);
  const getState = useCallback(() => entry?.state || emptySnapshotState, [entry]);
  const state = useSyncExternalStore(subscribe, getState, () => emptySnapshotState);

  useEffect(() => {
    if (entry) snapshotCache.load(entry, limit).catch(() => {});
    // Requests belong to the shared cache, so switching views does not cancel them.
  }, [entry, limit, state.version]);

  const reload = useCallback(async () => {
    if (entry) await snapshotCache.load(entry, limit, { force: true }).catch(() => {});
  }, [entry, limit]);
  const snapshots = useMemo(() => state.rows.slice(0, limit), [state.rows, limit]);
  const verifiedSnapshots = useMemo(() => snapshots.filter(isVerifiedSnapshot), [snapshots]);
  return {
    allSnapshots: snapshots,
    snapshots: verifiedSnapshots,
    loading: state.loading,
    error: state.error,
    reload,
  };
}
