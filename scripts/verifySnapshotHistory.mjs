import { PrismaClient } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { buildSnapshotData } from '../src/lib/snapshotValuation.js';
import { fetchStockMonthlyPrices, fetchMFHistoricalNAV } from '../src/lib/historicalPrices.js';
import { dayKey, isVerifiedSnapshot } from '../src/lib/financialRules.js';

const args = process.argv.slice(2);
const portfolioId = args[args.indexOf('--portfolio') + 1];
if (!args.includes('--portfolio') || !portfolioId) throw new Error('Provide --portfolio ID. Default is a dry run; apply a prepared run with --apply --run PATH.');
const db = new PrismaClient();
const orderBy = [{ tradeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];
const flatten = t => ({ ...t, ...t.instrument, id: t.id, instrumentId: t.instrumentId,
  quantity: t.quantity.toString(), price: t.price.toString(), brokerage: t.brokerage?.toString(), taxBrokerage: t.taxBrokerage?.toString(),
  tradeDate: dayKey(t.tradeDate), createdAt: t.createdAt.toISOString(),
});

try {
  if (args.includes('--apply')) {
    if (!args.includes('--run')) throw new Error('Apply requires the prepared --run PATH.');
    const directory = resolve(args[args.indexOf('--run') + 1]);
    const plan = JSON.parse(await readFile(join(directory, 'plan.json'), 'utf8'));
    if (plan.portfolioId !== portfolioId) throw new Error('Portfolio differs from prepared plan.');
    // Ensure the original snapshot backup exists before making any updates.
    const backup = JSON.parse(await readFile(join(directory, 'backup.json'), 'utf8'));
    if (backup.portfolioId !== portfolioId) throw new Error('Backup differs from prepared plan.');
    let updated = 0;
    for (let offset = 0; offset < plan.updates.length; offset += 20) {
      const batch = plan.updates.slice(offset, offset + 20);
      await db.$transaction(async tx => {
        const locked = await tx.portfolio.updateMany({ where: { id: portfolioId, revision: plan.revision }, data: { revision: { increment: 0 } } });
        if (locked.count !== 1) throw new Error('Trade history changed; prepare a new verification plan.');
        for (const update of batch) {
          const original = backup.snapshots.find(s => s.id === update.id);
          const current = await tx.snapshot.findUnique({ where: { id: update.id } });
          if (JSON.stringify(current) !== JSON.stringify(original)) throw new Error(`Snapshot ${update.id} changed after preparation; prepare again.`);
          await tx.snapshot.update({ where: { id: update.id, portfolioId }, data: { ...update.data, valuationAt: new Date(update.data.valuationAt) } });
        }
      }, { timeout: 30000 });
      updated += batch.length;
      console.log(`Updated ${updated}/${plan.updates.length}`);
    }
    const saved = await db.snapshot.findMany({ where: { portfolioId } });
    const result = { updated, total: saved.length, verified: saved.filter(isVerifiedSnapshot).length, unresolved: saved.filter(s => !isVerifiedSnapshot(s)).length, failures: plan.failures, backup: join(directory, 'backup.json') };
    await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else {
    const loaded = await db.$transaction(async tx => ({
      portfolio: await tx.portfolio.findUniqueOrThrow({ where: { id: portfolioId } }),
      trades: await tx.trade.findMany({ where: { portfolioId }, include: { instrument: true }, orderBy }),
      actions: await tx.corporateAction.findMany({ where: { portfolioId }, orderBy: [{ exDate: 'asc' }, { id: 'asc' }] }),
      snapshots: await tx.snapshot.findMany({ where: { portfolioId }, orderBy: { snapshotAt: 'asc' } }),
    }), { isolationLevel: 'RepeatableRead', timeout: 30000 });
    if (!loaded.snapshots.length) throw new Error('No saved snapshots in this portfolio.');
    const directory = resolve('.cache/snapshot-repair', String(Date.now()));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'backup.json'), JSON.stringify({ portfolioId, ...loaded }, null, 2));
    const fromDate = dayKey(new Date(Date.parse(dayKey(loaded.snapshots[0].snapshotAt)) - 7 * 864e5));
    const instruments = [...new Map(loaded.trades.map(t => [t.instrumentId, t.instrument])).values()];
    const histories = args.includes('--reuse-run')
      ? JSON.parse(await readFile(join(resolve(args[args.indexOf('--reuse-run') + 1]), 'prices.json'), 'utf8')) : {};
    const fetchErrors = [];
    for (let index = 0; index < instruments.length; index += 4) {
      await Promise.all(instruments.slice(index, index + 4).map(async instrument => {
        try {
          const refreshSymbol = args.includes('--refresh-symbol') ? args[args.indexOf('--refresh-symbol') + 1] : null;
          if (Object.keys(histories[instrument.id] || {}).length && instrument.symbol !== refreshSymbol) return;
          if (instrument.assetType === 'MF' && !instrument.isin) throw new Error('Missing verified fund ISIN');
          histories[instrument.id] = instrument.assetType === 'MF'
            ? await fetchMFHistoricalNAV(instrument.isin, fromDate, { daily: true })
            : await fetchStockMonthlyPrices(instrument.symbol, instrument.exchange, fromDate, { daily: true });
          console.log(`${instrument.symbol}: ${Object.keys(histories[instrument.id]).length} dated prices`);
        } catch (error) {
          histories[instrument.id] = {};
          fetchErrors.push({ symbol: instrument.symbol, reason: error.message });
        }
      }));
    }
    await writeFile(join(directory, 'prices.json'), JSON.stringify(histories));
    const trades = loaded.trades.map(flatten), updates = [], failures = [];
    for (const snapshot of loaded.snapshots) {
      const asOf = dayKey(snapshot.valuationAt || snapshot.snapshotAt), prices = {}, meta = {};
      for (const instrument of instruments) {
        const original = snapshot.priceProvenance?.[instrument.id];
        let record = original?.asOf && original.asOf <= asOf && Date.parse(asOf) - Date.parse(original.asOf) <= 7 * 864e5 && Number(original.price) > 0 && original.source && original.source !== 'unknown' ? original : null;
        if (!record) {
          const date = Object.keys(histories[instrument.id]).filter(date => date <= asOf).sort().at(-1);
          record = histories[instrument.id][date];
        }
        if (record) { prices[instrument.id] = record.price; meta[instrument.id] = record; }
      }
      try {
        const data = buildSnapshotData(trades, prices, meta, { asOf, corporateActions: loaded.actions, revision: loaded.portfolio.revision });
        updates.push({ id: snapshot.id, snapshotAt: snapshot.snapshotAt, data });
      } catch (error) { failures.push({ id: snapshot.id, asOf, reason: error.message }); }
    }
    const plan = { portfolioId, revision: loaded.portfolio.revision, updates, failures, fetchErrors };
    await writeFile(join(directory, 'plan.json'), JSON.stringify(plan, null, 2));
    const issueCounts = failures.reduce((counts, failure) => {
      const issue = failure.reason.split(' on ')[0];
      counts[issue] = (counts[issue] || 0) + 1;
      return counts;
    }, {});
    console.log(JSON.stringify({ directory, total: loaded.snapshots.length, ready: updates.length, unresolved: failures.length, issueCounts, fetchErrors }, null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.$disconnect(); }
