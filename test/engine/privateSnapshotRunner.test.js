import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { publicSnapshotSummary } from '../../src/lib/privateSnapshotRunner.js';

const execute = promisify(execFile);
const summary = { asOf: '2026-10-23', refreshed: 2, eligible: 2, saved: 1, skippedEmpty: 0, failed: 0 };

test('only date and numeric aggregate counts can cross the public summary boundary', () => {
  assert.deepEqual(publicSnapshotSummary({ ...summary, failures: [{ portfolioId: 'PRIVATE', message: 'SECRET' }], password: 'SECRET' }), summary);
  assert.equal(publicSnapshotSummary({ ...summary, asOf: 'PRIVATE_HOLDING_SYMBOL' }), null);
  assert.equal(publicSnapshotSummary({ ...summary, saved: 'SECRET' }), null);
  assert.equal(publicSnapshotSummary({ ...summary, failed: -1 }), null);
  assert.equal(publicSnapshotSummary({ ...summary, eligible: Infinity }), null);
});

async function workerOutput(mode = '') {
  const runner = new URL('../../src/lib/privateSnapshotRunner.js', import.meta.url).href;
  const worker = fileURLToPath(new URL('../fixtures/privateSnapshotWorker.mjs', import.meta.url));
  // Separate parent captures the actual public output; the grandchild emits sensitive sentinels.
  const source = `import { runPrivateSnapshotWorker } from ${JSON.stringify(runner)};
    try { console.log(JSON.stringify(await runPrivateSnapshotWorker(${JSON.stringify(worker)}))); }
    catch { console.error('Generic update failure'); process.exitCode = 1; }`;
  try {
    const output = await execute(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, PRIVATE_SNAPSHOT_TEST_MODE: mode } });
    return { ...output, code: 0 };
  } catch (error) { return { stdout: error.stdout, stderr: error.stderr, code: error.code }; }
}

test('provider, database and engine stdout/stderr are discarded; arbitrary IPC data is stripped', async () => {
  const output = await workerOutput();
  assert.equal(output.code, 0);
  assert.deepEqual(JSON.parse(output.stdout), { summary, failed: false });
  assert.equal(output.stderr, '');
  assert.doesNotMatch(output.stdout + output.stderr, /PRIVATE_|fake-password|postgresql:/);
});

test('a worker error remains a failure even if it sent a valid summary', async () => {
  const output = await workerOutput('failure');
  assert.equal(JSON.parse(output.stdout).failed, true);
  assert.doesNotMatch(output.stdout + output.stderr, /PRIVATE_|fake-password/);
});

test('uncaught worker exceptions expose no stack or private details to public output', async () => {
  const output = await workerOutput('crash');
  assert.equal(output.code, 1);
  assert.equal(output.stdout, '');
  assert.equal(output.stderr.trim(), 'Generic update failure');
  assert.doesNotMatch(output.stdout + output.stderr, /PRIVATE_|fake-password|postgresql:/);
});

test('the CLI configuration failure never prints supplied connection credentials', async () => {
  const entry = fileURLToPath(new URL('../../scripts/dailyPortfolioSnapshot.mjs', import.meta.url));
  await assert.rejects(execute(process.execPath, [entry], { env: { ...process.env,
    DATABASE_URL: 'postgresql://fake-user:PRIVATE_PASSWORD@fake-host/fake-db', PORTFOLIO_OWNER_EMAIL: '',
  } }), error => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /Check DATABASE_URL, PORTFOLIO_OWNER_EMAIL/);
    assert.doesNotMatch(error.stderr, /PRIVATE_|fake-host|postgresql:/);
    return true;
  });
});
