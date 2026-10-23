import { fork } from 'node:child_process';

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
    child.on('message', message => { summary = publicSnapshotSummary(message); });
    child.on('error', () => reject(new Error('Daily portfolio update could not start.')));
    child.on('exit', code => {
      if (!summary) reject(new Error('Daily portfolio update failed. Check the configured secrets and database connectivity privately.'));
      else resolve({ summary, failed: code !== 0 || summary.failed > 0 });
    });
  });
}
