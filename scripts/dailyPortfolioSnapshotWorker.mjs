import { PrismaClient } from '@prisma/client';
import { collectInstrumentPrices } from '../src/lib/priceService.js';
import { runDailyPortfolioSnapshots } from '../src/lib/dailyPortfolioSnapshot.js';
import { publicSnapshotSummary } from '../src/lib/privateSnapshotRunner.js';

// Runs only as a child with stdout/stderr discarded. No raw result or error crosses IPC.
const db = new PrismaClient({ log: [] });
try {
  const result = await runDailyPortfolioSnapshots({ db, collectPrices: collectInstrumentPrices, ownerEmail: process.env.PORTFOLIO_OWNER_EMAIL });
  const summary = publicSnapshotSummary({ ...result, failed: result.failures.length });
  if (summary && process.send) process.send(summary);
  if (!summary || result.failures.length) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  try { await db.$disconnect(); } catch { process.exitCode = 1; }
  if (process.connected) process.disconnect();
}
