/**
 * migrate.js — runs prisma db push + seed automatically on first boot
 * Called from next.config.mjs in development if DB_AUTO_MIGRATE=true
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

export async function autoMigrate() {
  if (process.env.NODE_ENV !== 'development') return;
  if (!process.env.DATABASE_URL) {
    console.warn('[portfin] DATABASE_URL not set — skipping auto-migrate');
    return;
  }
  if (process.env.DB_AUTO_MIGRATE !== 'true') return;

  console.log('[portfin] Running auto-migrate...');
  try {
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    console.log('[portfin] ✅ db push done');

    // Only seed if trades table is empty
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const count = await p.trade.count();
    await p.$disconnect();
    if (count === 0) {
      console.log('[portfin] Seeding database...');
      execSync('node --experimental-vm-modules prisma/seed.js', { stdio: 'inherit' });
    }
  } catch (e) {
    console.error('[portfin] Auto-migrate failed:', e.message);
  }
}
