// Synthetic data only. Output must never reach the public workflow runner.
console.log('PRIVATE_HOLDING_SYMBOL PRIVATE_PORTFOLIO_ID');
console.warn('PRIVATE_PROVIDER_ERROR');
process.stderr.write('PRIVATE_DATABASE_ERROR postgresql://fake-user:fake-password@fake-host/fake-db\n');

if (process.env.PRIVATE_SNAPSHOT_TEST_MODE === 'crash') throw new Error('PRIVATE_CRASH_DETAILS');
if (['diagnostic', 'unknown-diagnostic'].includes(process.env.PRIVATE_SNAPSHOT_TEST_MODE)) {
  process.send({ type: 'failure', code: process.env.PRIVATE_SNAPSHOT_TEST_MODE === 'diagnostic' ? 'owner_not_found' : 'PRIVATE_ERROR', message: 'PRIVATE_DATABASE_ERROR' });
  process.disconnect();
  process.exitCode = 1;
} else {
process.send({ asOf: '2026-10-23', refreshed: 2, eligible: 2, saved: 1, skippedEmpty: 0, failed: 0,
  portfolioId: 'PRIVATE_PORTFOLIO_ID', holdings: ['PRIVATE_HOLDING_SYMBOL'], error: 'PRIVATE_DATABASE_ERROR' });
process.disconnect();
if (process.env.PRIVATE_SNAPSHOT_TEST_MODE === 'failure') process.exitCode = 1;
}
