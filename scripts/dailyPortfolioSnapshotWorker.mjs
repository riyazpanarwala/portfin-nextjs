import { publicSnapshotSummary, snapshotFailureCode } from '../src/lib/privateSnapshotRunner.js';

// Runs only as a child with stdout/stderr discarded. No raw result or error crosses IPC.
let db;
let stage = 'startup';
try {
  const { PrismaClient } = await import('@prisma/client');
  const { collectInstrumentPrices } = await import('../src/lib/priceService.js');
  const { runDailyPortfolioSnapshots } = await import('../src/lib/dailyPortfolioSnapshot.js');
  db = new PrismaClient({ log: [] });
  const result = await runDailyPortfolioSnapshots({ db, collectPrices: collectInstrumentPrices, ownerEmail: process.env.PORTFOLIO_OWNER_EMAIL, onStage: value => { stage = value; } });
  const summary = publicSnapshotSummary({ ...result, failed: result.failures.length });
  if (summary && process.send) process.send(summary);
  if (!summary || result.failures.length) process.exitCode = 1;
} catch (error) {
  if (process.send) process.send({ type: 'failure', code: snapshotFailureCode(error, stage) });
  process.exitCode = 1;
} finally {
  try { await db?.$disconnect(); } catch {
    if (process.send) process.send({ type: 'failure', code: 'disconnect' });
    process.exitCode = 1;
  }
  if (process.connected) process.disconnect();
}
