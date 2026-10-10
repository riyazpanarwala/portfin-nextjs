# Trade retries and login protection

## Database rollout

Deploy `20261010000200_trade_retries_login_limits` before deploying this application version. It adds two tables without changing existing portfolio records. Both tables enable RLS and revoke public, Supabase anon and authenticated access. Prisma must use the existing trusted server role.

For this repository's configured Supabase pooler, `node scripts/migrateP0P1.mjs backup`, `deploy` and `verify` use the session pooler for migration commands while preserving the application's connection settings. For another environment, use `prisma migrate deploy` with its migration connection.

The migration was applied to the configured Supabase database on 10 October 2026. Migration status is current and schema comparison reports no drift. Record fingerprints matched the private pre-migration backup: 2 users, 2 portfolios, 44 instruments, 765 trades and 269 snapshots were unchanged. The new tables have RLS enabled, are owned by postgres and are accessible through the existing server role with BYPASSRLS. The private application-table backup is under `.cache/migration-backups/2026-10-10T08-26-52-506Z-portfin.*`; it is excluded from Git.

## Trade submissions

`POST /api/trades` requires an `Idempotency-Key` header of 16–128 letters, digits, underscores or hyphens. Generate a random UUID for each new logical submission and retain it for retries with the same payload. A new key permits a legitimate identical trade; this does not deduplicate broker rows by their financial values.

The first request returns 201. An identical retry returns 200 with the existing trade and `replayed: true`, without changing the ledger revision again. Different data under the same portfolio/key returns 409. Keys are scoped to an owned portfolio and saved in the trade's database transaction. Deleting a trade retains a submission tombstone, so retries return 409 instead of recreating it. A replay returns the current saved trade, including subsequent edits.

The manual form retains its key after an error and blocks overlapping submissions. Each imported row retains its own key during an import attempt. The client merges successful responses by trade ID to avoid duplicate UI rows. Keys are held for the mounted form/import session; callers retrying across reloads must retain their original key.

## Login limits

All valid login attempts, successful or not, consume PostgreSQL-backed allowances before looking up the user or deriving the password key. The limits are five attempts per normalized email and thirty per trusted source, over fifteen minutes starting at the first attempt. Blocked attempts return 429 with `Retry-After`, perform no password verification, and do not extend the window. Database errors fail closed. Expired rows older than one day are pruned on an allowed request, at most once per fifteen minutes per server instance.

By default, forwarded headers are ignored and all clients share a fallback source allowance. To enable independent per-IP allowances, set server-only `PORTFIN_TRUSTED_IP_HEADER` to `x-real-ip`, `cf-connecting-ip` or `x-vercel-forwarded-for`. Only configure a header your trusted ingress overwrites; prevent clients from bypassing that ingress. Missing, invalid or unsupported headers use the shared fallback. Never trust arbitrary `X-Forwarded-For` or expose this setting with NEXT_PUBLIC.

Password verification now uses asynchronous PBKDF2 with constant-time digest comparison and preserves the existing hash format. Unknown accounts perform dummy verification and receive the same invalid-credentials response. The synchronous hash-creation helper remains available for offline provisioning; no request handler uses it.

## Tests

Run `npm test` for unit/regression checks. Run `npm run test:integration` with an explicitly configured `PORTFIN_TEST_DATABASE_URL` for PostgreSQL concurrency, rollback, deleted-trade retry and rate-window tests. Without that variable the integration suite skips. The integration role needs permission to create/drop a temporary schema; fixtures live only in a randomly generated `portfin_test_*` schema, removed in cleanup. The target must have the existing PortFin tables from the earlier migrations. The test creates the new tables from this migration inside its temporary schema, so it can run before this migration is deployed.
