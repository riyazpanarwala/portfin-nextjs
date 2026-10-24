import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runPrivateSnapshotWorker } from '../src/lib/privateSnapshotRunner.js';

try {
  if (!process.env.DATABASE_URL || !process.env.PORTFOLIO_OWNER_EMAIL) throw new Error('Missing configuration');
  let workerResult;
  try {
    workerResult = await runPrivateSnapshotWorker(fileURLToPath(new URL('./dailyPortfolioSnapshotWorker.mjs', import.meta.url)));
  } catch (error) {
    // The runner constructs this message exclusively from fixed, public strings.
    console.error(error.message);
    process.exitCode = 1;
  }
  if (workerResult) {
    const { summary: result, failed } = workerResult;
    console.log(JSON.stringify(result, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Daily portfolio update — ${result.asOf}\n\nRefreshed ${result.refreshed}/${result.eligible} active instruments. Saved ${result.saved} portfolio checkpoint(s). Skipped ${result.skippedEmpty} empty portfolio(s). Failed ${result.failed} portfolio(s).\n\nHolding details and error messages are omitted from public logs. Individual price dates remain in the application's snapshot data.\n\n`);
    }
    if (failed) {
      console.error('Daily portfolio update was incomplete. Investigate failed valuations privately in the application.');
      process.exitCode = 1;
    }
  }
} catch {
  console.error('Daily portfolio update failed. Check DATABASE_URL, PORTFOLIO_OWNER_EMAIL, database connectivity, and price-provider availability privately.');
  process.exitCode = 1;
}
