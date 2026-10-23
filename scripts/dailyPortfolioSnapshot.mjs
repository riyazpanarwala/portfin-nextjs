import { appendFile } from 'node:fs/promises';
import { prisma } from '../src/lib/prisma.js';
import { collectInstrumentPrices } from '../src/lib/priceService.js';
import { runDailyPortfolioSnapshots } from '../src/lib/dailyPortfolioSnapshot.js';

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const result = await runDailyPortfolioSnapshots({ db: prisma, collectPrices: collectInstrumentPrices, ownerEmail: process.env.PORTFOLIO_OWNER_EMAIL, log: console.log });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Daily portfolio update — ${result.asOf}\n\nRefreshed ${result.refreshed}/${result.eligible} active instruments. Saved ${result.saved} portfolio checkpoint(s). Skipped ${result.skippedEmpty} empty portfolio(s). Failed ${result.failures.length} portfolio(s).\n\nPrice dates appear in the step logs; weekends, holidays, and pending NAV publications may use the previous published price.\n\n`);
  }
  if (result.failures.length) process.exitCode = 1;
} catch (error) {
  console.error('Daily portfolio update failed:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
