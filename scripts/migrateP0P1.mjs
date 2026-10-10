import nextEnv from '@next/env';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

nextEnv.loadEnvConfig(process.cwd());
const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') url.port = '5432';
for (const key of ['pgbouncer', 'statement_cache_size']) url.searchParams.delete(key);
url.searchParams.set('connect_timeout', '10');
const environment = { ...process.env, DATABASE_URL: url.toString() };
const tables = ['users', 'portfolios', 'instruments', 'trades', 'snapshots'];
const addedColumns = { users: [], portfolios: ['revision'], instruments: ['price_as_of', 'price_source', 'tax_category'], trades: ['tax_brokerage'], snapshots: ['engine_version', 'ledger_revision', 'price_provenance', 'stale', 'valuation_at'] };
const mode = process.argv[2];

function cli(args) {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { env: environment, encoding: 'utf8', timeout: 60000 });
  if (result.error) throw new Error('Prisma command could not finish: ' + result.error.code);
  if (result.status !== 0) throw new Error((result.stdout || '') + (result.stderr || 'Prisma command failed'));
  return result.stdout;
}

async function main() {
  if (mode === 'inspect') {
    // Keep the pre-migration schema stable when HEAD advances after deployment.
    const baseline = 'prisma/migrations/20261010000000_baseline/schema.prisma';
    console.log(cli(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', baseline, '--exit-code']));
  } else if (mode === 'baseline') {
    console.log(cli(['migrate', 'resolve', '--applied', '20261010000000_baseline']));
    return;
  } else if (mode === 'deploy') {
    console.log(cli(['migrate', 'deploy']));
    return;
  } else if (mode === 'verify') {
    console.log(cli(['migrate', 'status']));
    console.log(cli(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code']));
  } else if (mode !== 'backup') throw new Error('Use inspect, backup, baseline, deploy, or verify');

  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  try {
    const roles = await db.$queryRawUnsafe('SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    console.log('Database role:', roles);
    const counts = await db.$transaction(async tx => {
      const counts = {};
      const backup = {};
      const fingerprints = {};
      for (const table of tables) {
        const rows = await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM public."${table}" t ORDER BY id`);
        counts[table] = rows.length;
        backup[table] = rows.map(r => r.row);
        const columns = addedColumns[table].map(column => `'${column}'`).join(',');
        const canonical = await tx.$queryRawUnsafe(`SELECT (to_jsonb(t) - ARRAY[${columns}]::text[])::text AS row FROM public."${table}" t ORDER BY id`);
        fingerprints[table] = createHash('sha256').update(canonical.map(r => r.row).join('\n')).digest('hex');
      }
      if (mode === 'backup') {
        const directory = resolve('.cache/migration-backups');
        mkdirSync(directory, { recursive: true });
        const path = join(directory, new Date().toISOString().replace(/[:.]/g, '-') + '-portfin.json');
        writeFileSync(path, JSON.stringify({ createdAt: new Date().toISOString(), format: 'portfin-table-json-text-v1', fingerprints, tables: backup }), { mode: 0o600, flag: 'wx' });
        const schemaPath = path.replace('.json', '-schema.prisma');
        writeFileSync(schemaPath, cli(['db', 'pull', '--print']), { mode: 0o600, flag: 'wx' });
        console.log('Private application-table backup:', path);
      }
      if (mode === 'verify' && process.argv[3]) {
        const original = JSON.parse(readFileSync(process.argv[3], 'utf8'));
        const unchanged = tables.every(table => fingerprints[table] === original.fingerprints[table]);
        console.log('Existing application records unchanged:', unchanged);
        if (!unchanged) throw new Error('Application records changed since backup; investigate concurrent writes before claiming unchanged data.');
      }
      return counts;
    }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
    console.log('Application row counts:', counts);
    if (mode === 'verify') {
      const security = await db.$queryRawUnsafe("SELECT c.relname, c.relrowsecurity, r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relname IN ('sessions','corporate_actions')");
      console.log('Server-table security:', security);
      const sessions = await db.session.count();
      const actions = await db.corporateAction.count();
      console.log('New model access:', { sessions, corporateActions: actions });
    }
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  let message = String(error.message).replaceAll(url.toString(), '[database connection]');
  if (url.password) message = message.replaceAll(url.password, '[redacted]').replaceAll(decodeURIComponent(url.password), '[redacted]');
  console.error(message); process.exitCode = 1;
});
