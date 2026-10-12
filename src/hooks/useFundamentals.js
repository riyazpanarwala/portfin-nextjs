'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { analyticsRequestKey, startFundamentalsRequest, EMPTY_FUNDAMENTALS } from '@/lib/analyticsClient';

export function useFundamentals(holdings) {
  const requestKey = analyticsRequestKey(holdings);
  const [state, setState] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const forceRef = useRef(false);
  const refresh = useCallback(() => {
    forceRef.current = true;
    setRefreshVersion(version => version + 1);
  }, []);

  useEffect(() => {
    const payload = JSON.parse(requestKey);
    const force = forceRef.current;
    forceRef.current = false;
    if (!payload.length) return;
    let cancel;
    const timer = setTimeout(() => {
      cancel = startFundamentalsRequest(payload, { force, onState: next => setState({ ...next, requestKey, refreshVersion }) });
    }, 0);
    return () => { clearTimeout(timer); cancel?.(); };
  }, [requestKey, refreshVersion]);

  // Hide old rows immediately, including when the portfolio becomes empty.
  const current = requestKey !== '[]' && state?.requestKey === requestKey && state?.refreshVersion === refreshVersion ? state : null;
  return {
    data: current?.data || EMPTY_FUNDAMENTALS,
    error: current?.error || null,
    loading: requestKey !== '[]' && (current?.loading ?? true),
    refresh,
  };
}
