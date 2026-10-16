import { PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { dayKey, isVerifiedSnapshot } from '../src/lib/financialRules.js';

const args = process.argv.slice(2);
if (!args.includes('--portfolio') || !args.includes('--run')) throw new Error('Provide --portfolio ID --run PATH and optionally --apply.');
const portfolioId = args[args.indexOf('--portfolio') + 1];
const directory = resolve(args[args.indexOf('--run') + 1]);
const plan = JSON.parse(await readFile(join(directory, 'plan.json'), 'utf8'));
if (plan.portfolioId !== portfolioId) throw new Error('Plan portfolio mismatch.');
const ids = plan.failures.filter(failure => failure.reason.startsWith('Missing or stale valuation price for UTTAMVALUE on ')).map(failure => failure.id);
const db = new PrismaClient();
try {
  const snapshots = await db.snapshot.findMany({ where: { portfolioId, id: { in: ids }, stale: true }, orderBy: { snapshotAt: 'asc' } });
  if (!args.includes('--apply')) {
    console.log(JSON.stringify({ selected: snapshots.length, action: 'Accept saved values with the known UTTAMVALUE limitation; retain all financial values.' }));
  } else {
    const backupPath = join(directory, `user-acceptance-backup-${Date.now()}.json`);
    await writeFile(backupPath, JSON.stringify(snapshots, null, 2), { flag: 'wx' });
    const acceptedAt = new Date().toISOString();
    await db.$transaction(async tx => {
      const locked = await tx.portfolio.updateMany({ where: { id: portfolioId, revision: plan.revision }, data: { revision: { increment: 0 } } });
      if (locked.count !== 1) throw new Error('Ledger changed; audit again before acknowledging snapshots.');
      for (const snapshot of snapshots) {
        const result = await tx.snapshot.updateMany({ where: { id: snapshot.id, portfolioId, stale: true }, data: {
          stale: false, valuationAt: snapshot.valuationAt || new Date(dayKey(snapshot.snapshotAt)),
          ledgerRevision: plan.revision, engineVersion: 'user-accepted-v1',
          priceProvenance: { ...(snapshot.priceProvenance || {}), __verification: {
            source: 'user-acknowledgement', acceptedAt,
            reason: 'User explicitly accepted the existing snapshot values with the known UTTAMVALUE historical-price and delisting limitation.',
            originalEngineVersion: snapshot.engineVersion, originalValuationAt: snapshot.valuationAt, originalStale: snapshot.stale,
          } },
        } });
        if (result.count !== 1) throw new Error('Snapshot changed during acceptance.');
      }
    }, { timeout: 120000 });
    const all = await db.snapshot.findMany({ where: { portfolioId } });
    console.log(JSON.stringify({ accepted: snapshots.length, verified: all.filter(isVerifiedSnapshot).length, total: all.length, backupPath }, null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await db.$disconnect(); }
