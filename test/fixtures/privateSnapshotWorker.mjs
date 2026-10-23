// Synthetic data only. Output must never reach the public workflow runner.
console.log('PRIVATE_HOLDING_SYMBOL PRIVATE_PORTFOLIO_ID');
console.warn('PRIVATE_PROVIDER_ERROR');
process.stderr.write('PRIVATE_DATABASE_ERROR postgresql://fake-user:fake-password@fake-host/fake-db\n');

if (process.env.PRIVATE_SNAPSHOT_TEST_MODE === 'crash') throw new Error('PRIVATE_CRASH_DETAILS');
process.send({ asOf: '2026-10-23', refreshed: 2, eligible: 2, saved: 1, skippedEmpty: 0, failed: 0,
  portfolioId: 'PRIVATE_PORTFOLIO_ID', holdings: ['PRIVATE_HOLDING_SYMBOL'], error: 'PRIVATE_DATABASE_ERROR' });
process.disconnect();
if (process.env.PRIVATE_SNAPSHOT_TEST_MODE === 'failure') process.exitCode = 1;
