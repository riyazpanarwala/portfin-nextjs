/**
 * app/api/backfill-snapshots/route.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/backfill-snapshots
 *
 * Reconstructs month-by-month portfolio snapshots from the first trade date
 * using historical price APIs:
 *   - Stocks: Yahoo Finance monthly OHLCV (free, no auth)
 *   - MFs:    mfapi.in historical NAV (free AMFI wrapper)
 *
 * Body: { portfolioId: string, fromMonth?: 'YYYY-MM', dryRun?: boolean }
 *
 * The endpoint streams progress as NDJSON so the UI can show a live progress bar.
 * Each line is one of:
 *   { type: 'progress', step: string, pct: number }
 *   { type: 'pricesFetched', symbol: string, months: number }
 *   { type: 'snapshot', month: string, totalValue: number, created: boolean }
 *   { type: 'done', created: number, skipped: number, errors: string[] }
 *   { type: 'error', message: string }
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';
import {
  fetchStockMonthlyPrices,
  fetchMFHistoricalNAV,
  fetchMFHistoricalNAVByName,
  buildMonthRange,
} from '@/lib/historicalPrices';
import { computeHoldings, computePortfolioStats } from '@/lib/store';

export const dynamic = 'force-dynamic';

// FIFO engine from store.js expects trades in the same flat format the frontend uses.
// We reproduce the shape that flattenTrade() produces.
function tradeToFlat(t) {
  return {
    id:           t.id,
    portfolioId:  t.portfolioId,
    instrumentId: t.instrumentId,
    symbol:       t.instrument.symbol,
    name:         t.instrument.name,
    assetType:    t.instrument.assetType,
    exchange:     t.instrument.exchange,
    sector:       t.instrument.sector ?? null,
    tradeType:    t.tradeType,
    quantity:     t.quantity.toString(),
    price:        t.price.toString(),
    brokerage:    t.brokerage ? t.brokerage.toString() : null,
    tradeDate:    t.tradeDate.toISOString().slice(0, 10),
    createdAt:    t.createdAt.toISOString(),
  };
}

/**
 * tradesUpToMonth
 * Filters trades to only those on or before the last day of `month` ('YYYY-MM').
 */
function tradesUpToMonth(trades, month) {
  const cutoff = `${month}-31`; // '31' is fine — string compare, YYYY-MM-DD
  return trades.filter(t => t.tradeDate <= cutoff);
}

/**
 * getPriceForMonth
 * Looks up the historical price for a symbol in the given month.
 * Falls back to the most recent prior month if the exact month is missing.
 */
function getPriceForMonth(priceHistory, month) {
  if (!priceHistory) return null;
  if (priceHistory[month] != null) return priceHistory[month];
  // Walk backwards up to 3 months
  let [y, m] = month.split('-').map(Number);
  for (let i = 0; i < 3; i++) {
    m--;
    if (m < 1) { m = 12; y--; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (priceHistory[key] != null) return priceHistory[key];
  }
  return null;
}

export const POST = withErrorHandler('POST /api/backfill-snapshots', async (request) => {
  const { portfolioId, fromMonth, dryRun = false } = await request.json();

  if (!portfolioId) return badRequest('portfolioId required');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      }

      const errors = [];

      try {
        // ── 1. Load all trades ──────────────────────────────────────────────
        send({ type: 'progress', step: 'Loading trades…', pct: 2 });

        const rawTrades = await prisma.trade.findMany({
          where: { portfolioId },
          include: { instrument: true },
          orderBy: { tradeDate: 'asc' },
        });

        if (!rawTrades.length) {
          send({ type: 'error', message: 'No trades found for this portfolio.' });
          controller.close();
          return;
        }

        const trades = rawTrades.map(tradeToFlat);

        // Determine month range
        const firstTradeMonth = trades[0].tradeDate.slice(0, 7);
        const startMonth = fromMonth && fromMonth > firstTradeMonth
          ? fromMonth
          : firstTradeMonth;
        const nowMonth = new Date().toISOString().slice(0, 7);
        // Don't backfill the current month — incomplete
        const endMonth = (() => {
          const [y, m] = nowMonth.split('-').map(Number);
          const pm = m - 1;
          return pm < 1
            ? `${y - 1}-12`
            : `${y}-${String(pm).padStart(2, '0')}`;
        })();

        const months = buildMonthRange(startMonth, endMonth);
        send({ type: 'progress', step: `Planning ${months.length} months (${startMonth} → ${endMonth})`, pct: 5 });

        // ── 2. Collect unique instruments ───────────────────────────────────
        const instruments = {};
        for (const t of trades) {
          if (!instruments[t.symbol]) {
            instruments[t.symbol] = {
              symbol:    t.symbol,
              name:      t.name,
              assetType: t.assetType,
              exchange:  t.exchange,
              isin:      null,
            };
          }
        }

        // Enrich with ISIN from DB (needed for MF NAV lookup)
        const dbInstruments = await prisma.instrument.findMany({
          where: { symbol: { in: Object.keys(instruments) } },
          select: { symbol: true, isin: true },
        });
        for (const inst of dbInstruments) {
          if (instruments[inst.symbol]) {
            instruments[inst.symbol].isin = inst.isin;
          }
        }

        const symbolList = Object.values(instruments);
        const stockSymbols = symbolList.filter(i => i.assetType === 'STOCK');
        const mfSymbols    = symbolList.filter(i => i.assetType === 'MF');

        send({
          type: 'progress',
          step:  `Fetching historical prices for ${stockSymbols.length} stocks + ${mfSymbols.length} MFs`,
          pct:   8,
        });

        // ── 3. Fetch historical prices for all symbols ─────────────────────
        // priceHistories: { [symbol]: { [month]: price } }
        const priceHistories = {};
        const totalSymbols   = symbolList.length;
        let fetchedCount = 0;

        // Stocks — Yahoo Finance monthly
        for (const inst of stockSymbols) {
          try {
            const history = await fetchStockMonthlyPrices(
              inst.symbol,
              inst.exchange,
              startMonth + '-01',
            );
            priceHistories[inst.symbol] = history;
            const pts = Object.keys(history).length;
            send({ type: 'pricesFetched', symbol: inst.symbol, months: pts, assetType: 'STOCK' });
          } catch (err) {
            errors.push(`Price fetch failed for ${inst.symbol}: ${err.message}`);
            priceHistories[inst.symbol] = {};
          }
          fetchedCount++;
          send({
            type: 'progress',
            step: `Fetched ${inst.symbol} (${fetchedCount}/${totalSymbols})`,
            pct:  8 + Math.round((fetchedCount / totalSymbols) * 40),
          });
        }

        // MFs — mfapi.in (AMFI historical NAV)
        for (const inst of mfSymbols) {
          try {
            let history = {};
            if (inst.isin) {
              history = await fetchMFHistoricalNAV(inst.isin, startMonth + '-01');
            }
            // Fallback to name search if ISIN gave nothing
            if (!Object.keys(history).length) {
              history = await fetchMFHistoricalNAVByName(inst.name || inst.symbol, startMonth + '-01');
            }
            priceHistories[inst.symbol] = history;
            const pts = Object.keys(history).length;
            send({ type: 'pricesFetched', symbol: inst.symbol, months: pts, assetType: 'MF' });
          } catch (err) {
            errors.push(`NAV fetch failed for ${inst.symbol}: ${err.message}`);
            priceHistories[inst.symbol] = {};
          }
          fetchedCount++;
          send({
            type: 'progress',
            step: `Fetched NAV for ${inst.symbol} (${fetchedCount}/${totalSymbols})`,
            pct:  8 + Math.round((fetchedCount / totalSymbols) * 40),
          });
        }

        // ── 4. Iterate months, compute portfolio state, upsert snapshots ────
        send({ type: 'progress', step: 'Computing month-by-month portfolio values…', pct: 50 });

        let created = 0;
        let skipped = 0;

        for (let mi = 0; mi < months.length; mi++) {
          const month = months[mi];
          const pct   = 50 + Math.round((mi / months.length) * 48);

          // Build price map for this month
          const currentPrices = {};
          for (const sym of Object.keys(priceHistories)) {
            const p = getPriceForMonth(priceHistories[sym], month);
            if (p != null) currentPrices[sym] = p;
          }

          // Compute holdings using only trades up to end of this month
          const monthTrades = tradesUpToMonth(trades, month);
          if (!monthTrades.length) { skipped++; continue; }

          let holdings, stats;
          try {
            holdings = computeHoldings(monthTrades, currentPrices);
            stats    = computePortfolioStats(holdings);
          } catch (err) {
            errors.push(`Compute failed for ${month}: ${err.message}`);
            skipped++;
            continue;
          }

          if (stats.totalValue <= 0) { skipped++; continue; }

          // Upsert snapshot — round to minute like the existing API does
          const snapshotAt = new Date(`${month}-01T00:00:00.000Z`);
          // Use the first of the month at midnight UTC as a canonical timestamp

          if (!dryRun) {
            try {
              const existing = await prisma.snapshot.findUnique({
                where: { portfolioId_snapshotAt: { portfolioId, snapshotAt } },
                select: { id: true },
              });

              await prisma.snapshot.upsert({
                where: { portfolioId_snapshotAt: { portfolioId, snapshotAt } },
                update: {
                  totalValue:        stats.totalValue,
                  totalInvested:     stats.totalInvested,
                  totalGain:         stats.totalGain,
                  totalReturnPct:    stats.totalReturnPct,
                  totalRealizedGain: stats.totalRealizedGain,
                  mfCagr:            stats.mfCagr,
                  stCagr:            stats.stCagr,
                  mfInvested:        stats.mfInvested,
                  stInvested:        stats.stInvested,
                  fundCount:         stats.fundCount,
                  stockCount:        stats.stockCount,
                },
                create: {
                  portfolioId,
                  snapshotAt,
                  totalValue:        stats.totalValue,
                  totalInvested:     stats.totalInvested,
                  totalGain:         stats.totalGain,
                  totalReturnPct:    stats.totalReturnPct,
                  totalRealizedGain: stats.totalRealizedGain,
                  mfCagr:            stats.mfCagr,
                  stCagr:            stats.stCagr,
                  mfInvested:        stats.mfInvested,
                  stInvested:        stats.stInvested,
                  fundCount:         stats.fundCount,
                  stockCount:        stats.stockCount,
                },
              });

              if (!existing) created++; else skipped++;
            } catch (err) {
              errors.push(`Snapshot upsert failed for ${month}: ${err.message}`);
              skipped++;
            }
          } else {
            created++;
          }

          send({
            type:          'snapshot',
            month,
            totalValue:    Math.round(stats.totalValue),
            totalInvested: Math.round(stats.totalInvested),
            totalGain:     Math.round(stats.totalGain),
            returnPct:     parseFloat(stats.totalReturnPct.toFixed(2)),
            mfCagr:        parseFloat((stats.mfCagr || 0).toFixed(2)),
            stCagr:        parseFloat((stats.stCagr  || 0).toFixed(2)),
            fundCount:     stats.fundCount,
            stockCount:    stats.stockCount,
            pricesCovered: Object.keys(currentPrices).length,
            totalSymbols:  Object.keys(priceHistories).length,
            dryRun,
            pct,
          });
        }

        send({
          type:    'done',
          created,
          skipped,
          errors,
          months:  months.length,
          dryRun,
        });

      } catch (err) {
        send({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
});
