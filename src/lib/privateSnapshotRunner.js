import { fork } from 'node:child_process';

const failureMessages = {
  startup: 'Snapshot worker could not initialize its dependencies.',
  configuration: 'PORTFOLIO_OWNER_EMAIL must be a valid account email.',
  owner_lookup: 'Could not look up the portfolio owner in the database.',
  owner_not_found: 'No portfolios match PORTFOLIO_OWNER_EMAIL. Check the repository secret.',
  ledger_read: 'Could not read the portfolio ledger. Check database schema and migrations.',
  database_connection: 'Cannot reach the database. Check DATABASE_URL and network access from GitHub Actions.',
  database_auth: 'Database authentication failed. Check DATABASE_URL credentials.',
  database_schema: 'Database schema is out of date. Apply the required migrations.',
  database_url: 'DATABASE_URL is invalid. Check the repository secret.',
  update: 'Daily portfolio update failed while processing the ledger or prices.',
  disconnect: 'Database cleanup failed.',
};

export function snapshotFailureCode(error, stage) {
  const code = error?.code || error?.errorCode;
  if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code)) return 'database_connection';
  if (['P1000', 'P1010'].includes(code)) return 'database_auth';
  if (['P2021', 'P2022'].includes(code)) return 'database_schema';
  if (code === 'P1013') return 'database_url';
  return Object.hasOwn(failureMessages, stage) ? stage : 'update';
}

// Explicit allowlist: never forward database/provider errors, holdings, IDs, or arbitrary IPC fields.
export function publicSnapshotSummary(value) {
  if (!value || typeof value.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)) return null;
  const counts = ['refreshed', 'eligible', 'saved', 'skippedEmpty', 'failed'];
  if (counts.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)) return null;
  return Object.fromEntries(['asOf', ...counts].map(key => [key, value[key]]));
}

export function runPrivateSnapshotWorker(workerPath, { forkWorker = fork } = {}) {
  return new Promise((resolve, reject) => {
    // Silence the entire dependency tree, including Prisma query errors and FIFO/provider warnings.
    // IPC is the only output channel, and only the summary allowlist is accepted from it.
    const child = forkWorker(workerPath, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
    let summary = null;
    let failure = null;
    child.on('message', message => {
      if (message?.type === 'failure' && Object.hasOwn(failureMessages, message.code)) {
        failure = message.code;
      } else {
        const candidate = publicSnapshotSummary(message);
        if (candidate) summary = candidate;
      }
    });
    child.on('error', () => reject(new Error('Daily portfolio update could not start.')));
    child.on('exit', code => {
      if (failure) reject(new Error(`Daily portfolio update failed [${failure}]. ${failureMessages[failure]}`));
      else if (!summary) reject(new Error('Daily portfolio update failed [startup]. Worker exited without a summary.'));
      else resolve({ summary, failed: code !== 0 || summary.failed > 0 });
    });
  });
}
