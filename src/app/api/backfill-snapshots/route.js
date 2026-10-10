import { prisma } from '@/lib/prisma';
import { withErrorHandler, flattenTrade } from '@/lib/apiHelpers';
import { requireOwnedPortfolio, HttpError } from '@/lib/auth';
import { lockPortfolio, tradeOrder } from '@/lib/ledger';
import { fetchStockMonthlyPrices, fetchMFHistoricalNAV, buildMonthRange } from '@/lib/historicalPrices';
import { buildSnapshotData } from '@/lib/snapshotValuation';
import { dayKey } from '@/lib/financialRules';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler('POST /api/backfill-snapshots', async (request, { session }) => {
  const { portfolioId, fromMonth, dryRun = false } = await request.json();
  await requireOwnedPortfolio(portfolioId, session);
  if (fromMonth != null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth)) throw new HttpError(400, 'Invalid starting month');
  const loaded = await prisma.$transaction(async db => {
    await lockPortfolio(db, portfolioId, session.userId);
    const portfolio = await db.portfolio.findUnique({ where: { id: portfolioId } });
    const trades = await db.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy: tradeOrder });
    const actions = await db.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] });
    return { trades, actions, revision: portfolio.revision };
  });
  if (!loaded.trades.length) throw new HttpError(400, 'No trades found');
  const trades = loaded.trades.map(flattenTrade);
  const instruments = [...new Map(loaded.trades.map(t => [t.instrumentId, t.instrument])).values()];
  const earliest = trades[0].tradeDate.slice(0, 7);
  const start = fromMonth && fromMonth > earliest ? fromMonth : earliest;
  const today = new Date();
  const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)).toISOString().slice(0, 7);
  const months = buildMonthRange(start, previousMonth);
  if (months.length > 600) throw new HttpError(400, 'Backfill range exceeds 50 years');
  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = data => { if (!cancelled && !request.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')); };
      let created = 0, updated = 0, skipped = 0;
      const errors = [];
      try {
        send({ type: 'progress', step: 'Loading verified historical prices', pct: 5 });
        const histories = {};
        for (let index = 0; index < instruments.length; index++) {
          if (cancelled || request.signal.aborted) return;
          const instrument = instruments[index];
          try {
            if (instrument.assetType === 'MF' && !instrument.isin) throw new Error('A verified ISIN is required');
            histories[instrument.id] = instrument.assetType === 'MF'
              ? await fetchMFHistoricalNAV(instrument.isin, start + '-01')
              : await fetchStockMonthlyPrices(instrument.symbol, instrument.exchange, start + '-01');
            send({ type: 'pricesFetched', symbol: instrument.symbol, months: Object.keys(histories[instrument.id]).length, assetType: instrument.assetType });
          } catch (err) {
            histories[instrument.id] = {};
            errors.push(instrument.symbol + ': ' + err.message);
          }
          send({ type: 'progress', step: 'Fetched ' + instrument.symbol, pct: 5 + Math.round((index + 1) / instruments.length * 40) });
        }
        for (let index = 0; index < months.length; index++) {
          if (cancelled || request.signal.aborted) return;
          const month = months[index];
          const [year, number] = month.split('-').map(Number);
          const asOf = dayKey(new Date(Date.UTC(year, number, 0)));
          const snapshotAt = new Date(asOf + 'T23:59:00Z');
          const prices = {}, meta = {};
          for (const instrument of instruments) {
            const record = histories[instrument.id]?.[month];
            if (record) { prices[instrument.id] = record.price; meta[instrument.id] = record; }
          }
          let data;
          try { data = buildSnapshotData(trades, prices, meta, { asOf, corporateActions: loaded.actions, revision: loaded.revision }); }
          catch (err) { errors.push(month + ': ' + err.message); skipped++; continue; }
          if (!dryRun) {
            const existed = await prisma.$transaction(async db => {
              await lockPortfolio(db, portfolioId, session.userId);
              const current = await db.portfolio.findUnique({ where: { id: portfolioId } });
              if (current.revision !== loaded.revision) throw new HttpError(409, 'Portfolio changed during backfill. Restart to use the new ledger.');
              // Legacy backfills used the first day of the month. Preserve them but mark stale.
              await db.snapshot.updateMany({ where: { portfolioId, snapshotAt: new Date(month + '-01T00:00:00Z'), valuationAt: null }, data: { stale: true } });
              const where = { portfolioId_snapshotAt: { portfolioId, snapshotAt } };
              const existing = await db.snapshot.findUnique({ where, select: { id: true } });
              await db.snapshot.upsert({ where, update: data, create: { portfolioId, snapshotAt, ...data } });
              return !!existing;
            });
            if (existed) updated++; else created++;
          } else created++;
          send({ type: 'snapshot', month, totalValue: data.totalValue, totalInvested: data.totalInvested, totalGain: data.totalGain, returnPct: data.totalReturnPct, mfCagr: data.mfCagr, stCagr: data.stCagr, fundCount: data.fundCount, stockCount: data.stockCount, pricesCovered: Object.keys(meta).length, totalSymbols: instruments.length, dryRun, pct: 50 + Math.round((index + 1) / months.length * 48) });
        }
        send({ type: 'done', created, updated, skipped, errors, months: months.length, dryRun });
      } catch (err) { send({ type: 'error', message: err.message }); }
      finally { if (!cancelled) controller.close(); }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'private, no-store' } });
});
