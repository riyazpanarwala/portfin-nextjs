export async function loadPortfolioBootstrap({ fetcher = fetch, signal } = {}) {
  const trades = [], prices = {}, meta = {};
  let portfolioId, revision, total, corporateActions = [];
  for (;;) {
    const response = await fetcher('/api/portfolio/bootstrap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(portfolioId ? { portfolioId, revision, offset: trades.length } : {}),
      signal, cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Portfolio unavailable');
    if (!Array.isArray(data.trades) || !Number.isSafeInteger(data.total) || data.total < 0 ||
        typeof data.portfolioId !== 'string' || !data.portfolioId || !Number.isSafeInteger(data.revision) ||
        typeof data.hasMore !== 'boolean') throw new Error('Invalid bootstrap response');
    if (portfolioId !== undefined && (portfolioId !== data.portfolioId || revision !== data.revision || total !== data.total)) {
      throw new Error('Portfolio changed during loading. Reload.');
    }
    if (portfolioId === undefined) corporateActions = data.corporateActions || [];
    portfolioId = data.portfolioId; revision = data.revision; total = data.total;
    trades.push(...data.trades);
    Object.assign(prices, data.prices); Object.assign(meta, data.meta);
    if (!data.hasMore) break;
    if (!data.trades.length || trades.length >= total) throw new Error('Incomplete trade history');
  }
  if (trades.length !== total || new Set(trades.map(trade => trade.id)).size !== total) throw new Error('Trade history did not reconcile');
  return { portfolioId, revision, trades, corporateActions, prices, meta };
}
