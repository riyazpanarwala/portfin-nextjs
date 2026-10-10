export async function loadTradeHistory(portfolioId, { fetcher = fetch, signal } = {}) {
  const trades = [];
  let revision, corporateActions = [], total;
  for (;;) {
    const params = new URLSearchParams({ portfolioId, limit: '1000', offset: String(trades.length) });
    if (revision !== undefined) params.set('revision', String(revision));
    const response = await fetcher(`/api/trades?${params}`, { signal, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Trade history unavailable');
    if (revision !== undefined && (revision !== data.revision || total !== data.total)) throw new Error('Portfolio changed during loading. Reload.');
    revision = data.revision; total = data.total; corporateActions = data.corporateActions || [];
    if (!Array.isArray(data.trades) || !Number.isInteger(total)) throw new Error('Invalid trade history response');
    trades.push(...data.trades);
    if (!data.hasMore) break;
    if (!data.trades.length) throw new Error('Incomplete trade history');
  }
  if (trades.length !== total || new Set(trades.map(t => t.id)).size !== total) throw new Error('Trade history did not reconcile');
  return { trades, corporateActions, revision };
}
