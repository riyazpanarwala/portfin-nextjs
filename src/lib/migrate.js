/**
 * migrate.js — runs prisma db push + seed automatically on first boot.
 * Called from next.config.mjs in development if DB_AUTO_MIGRATE=true.
 *
 * FIX (Issue 11): replaced blocking execSync calls with async spawn so the
 * Next.js dev server is never frozen waiting for a slow seed (NSE CSV download
 * can take 30 s+).  Each step has an explicit timeout; failure is logged and
 * the app starts anyway rather than appearing to hang.
 */
import { spawn } from 'child_process';

const PUSH_TIMEOUT_MS  = 60_000;  // 1 min — schema push should be fast
const SEED_TIMEOUT_MS  = 300_000; // 5 min — initial seed downloads CSVs

/**
 * runCommand — spawns a command, resolves with exit-code, rejects on timeout.
 * @param {string}   cmd
 * @param {string[]} args
 * @param {number}   timeoutMs
 * @returns {Promise<number>} exit code
 */
function runCommand(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`"${cmd} ${args.join(' ')}" timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function autoMigrate() {
  if (process.env.NODE_ENV !== 'development') return;
  if (!process.env.DATABASE_URL) {
    console.warn('[portfin] DATABASE_URL not set — skipping auto-migrate');
    return;
  }
  if (process.env.DB_AUTO_MIGRATE !== 'true') return;

  console.log('[portfin] Running auto-migrate (non-blocking)…');

  // --- Step 1: db push ---
  try {
    const pushCode = await runCommand(
      'npx', ['prisma', 'db', 'push', '--skip-generate'],
      PUSH_TIMEOUT_MS,
    );
    if (pushCode !== 0) {
      console.error(`[portfin] prisma db push exited with code ${pushCode} — skipping seed`);
      return;
    }
    console.log('[portfin] ✅ db push done');
  } catch (err) {
    console.error('[portfin] db push failed:', err.message);
    return;
  }

  // --- Step 2: seed only when trades table is empty ---
  try {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const count = await p.trade.count();
    await p.$disconnect();

    if (count > 0) {
      console.log(`[portfin] Skipping seed — ${count} trades already present`);
      return;
    }
  } catch (err) {
    console.warn('[portfin] Could not check trade count — skipping seed:', err.message);
    return;
  }

  // --- Step 3: run seed ---
  console.log('[portfin] Seeding database (this may take a few minutes)…');
  try {
    const seedCode = await runCommand(
      'node', ['--experimental-vm-modules', 'prisma/seed.js'],
      SEED_TIMEOUT_MS,
    );
    if (seedCode !== 0) {
      console.error(`[portfin] Seed exited with code ${seedCode}`);
    } else {
      console.log('[portfin] ✅ Seed complete');
    }
  } catch (err) {
    console.error('[portfin] Seed failed:', err.message);
  }
}
