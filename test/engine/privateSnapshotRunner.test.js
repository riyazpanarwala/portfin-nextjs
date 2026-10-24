import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { publicSnapshotSummary, snapshotFailureCode, runPrivateSnapshotWorker } from '../../src/lib/privateSnapshotRunner.js';

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

test('known worker failures provide a fixed actionable diagnostic without private fields', async () => {
  const output = await workerOutput('diagnostic');
  assert.equal(output.code, 1);
  assert.doesNotMatch(output.stdout + output.stderr, /PRIVATE_/);
  const worker = fileURLToPath(new URL('../fixtures/privateSnapshotWorker.mjs', import.meta.url));
  await assert.rejects(runPrivateSnapshotWorker(worker, {
    forkWorker: (path, args, options) => fork(path, args, { ...options, env: { ...process.env, PRIVATE_SNAPSHOT_TEST_MODE: 'diagnostic' } }),
  }), { message: 'Daily portfolio update failed [owner_not_found]. No portfolios match PORTFOLIO_OWNER_EMAIL. Check the repository secret.' });
});

test('database diagnostics use only recognized codes and fixed stages', () => {
  assert.equal(snapshotFailureCode({ code: 'P1001', message: 'PRIVATE_DATABASE' }, 'owner_lookup'), 'database_connection');
  assert.equal(snapshotFailureCode({ errorCode: 'P1000' }, 'owner_lookup'), 'database_auth');
  assert.equal(snapshotFailureCode({ code: 'P2022' }, 'ledger_read'), 'database_schema');
  assert.equal(snapshotFailureCode({ code: 'P1013' }, 'owner_lookup'), 'database_url');
  assert.equal(snapshotFailureCode(new Error('PRIVATE_ERROR'), 'owner_not_found'), 'owner_not_found');
  assert.equal(snapshotFailureCode({ code: 'PRIVATE_ERROR' }, 'PRIVATE_STAGE'), 'update');
});

test('unknown diagnostic codes are discarded', async () => {
  const output = await workerOutput('unknown-diagnostic');
  assert.equal(output.code, 1);
  assert.doesNotMatch(output.stdout + output.stderr, /PRIVATE_/);
});

test('Prisma initialization failures without error codes get safe actionable categories', () => {
  const initialization = message => ({ name: 'PrismaClientInitializationError', message });
  assert.equal(snapshotFailureCode(initialization("Can't reach database server at PRIVATE_HOST"), 'owner_lookup'), 'database_connection');
  assert.equal(snapshotFailureCode(initialization('Authentication failed against database server PRIVATE_HOST'), 'owner_lookup'), 'database_auth');
  assert.equal(snapshotFailureCode(initialization('Error opening a TLS connection: PRIVATE_CERTIFICATE'), 'owner_lookup'), 'database_tls');
  assert.equal(snapshotFailureCode(initialization('The provided database string is invalid. PRIVATE_URL'), 'owner_lookup'), 'database_url');
  assert.equal(snapshotFailureCode(initialization('PRIVATE_UNKNOWN_ERROR'), 'owner_lookup'), 'database_initialization');
  assert.equal(snapshotFailureCode({ name: 'PrismaClientValidationError', message: 'PRIVATE_QUERY' }, 'owner_lookup'), 'database_query');
  assert.equal(snapshotFailureCode({ code: 'P1011' }, 'owner_lookup'), 'database_tls');
  assert.equal(snapshotFailureCode({ code: 'P1003' }, 'owner_lookup'), 'database_missing');
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
