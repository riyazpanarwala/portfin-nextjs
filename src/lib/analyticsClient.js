export const EMPTY_FUNDAMENTALS = { fundamentals: {}, summary: null };

export function analyticsHoldingsPayload(holdings) {
  return holdings.map(h => ({ instrumentId: h.instrumentId, marketValue: h.marketValue }))
    .sort((a, b) => a.instrumentId.localeCompare(b.instrumentId));
}

export function analyticsRequestKey(holdings) {
  return JSON.stringify(analyticsHoldingsPayload(holdings));
}

export function portfolioBetaCacheSignature(userId, portfolioId, holdings) {
  return JSON.stringify([userId, portfolioId, analyticsHoldingsPayload(holdings)]);
}

export function startFundamentalsRequest(payload, { force = false, fetcher = fetch, onState } = {}) {
  const controller = new AbortController();
  const publish = state => { if (!controller.signal.aborted) onState(state); };
  if (!payload.length) {
    publish({ loading: false, error: null, data: EMPTY_FUNDAMENTALS });
    return () => controller.abort();
  }
  publish({ loading: true, error: null, data: EMPTY_FUNDAMENTALS });
  (async () => {
    try {
      const response = await fetcher('/api/fundamentals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: payload, force }), signal: controller.signal,
      });
      if (!response.ok) throw new Error('Failed to fetch fundamental metrics');
      const data = await response.json();
      if (!data?.fundamentals || typeof data.fundamentals !== 'object' || Array.isArray(data.fundamentals)) throw new Error('Invalid fundamentals response');
      publish({ loading: false, error: null, data });
    } catch (error) {
      publish({ loading: false, error: error.message, data: EMPTY_FUNDAMENTALS });
    }
  })();
  return () => controller.abort();
}
