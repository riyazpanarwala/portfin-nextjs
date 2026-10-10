# P0 / P1 changes and rollout

This change adds server sessions, portfolio ownership enforcement, immutable corporate actions, complete transaction pagination, fee-aware chronological FIFO, verified tax eligibility, dated price evidence, and server-calculated snapshots. It preserves JavaScript and the existing PostgreSQL data.

## Database rollout

Back up the database and rehearse on a restored staging copy before deployment. The application must be deployed together with its schema changes. No connected database migration was executed during implementation.

The repository previously used `db push` and had no migration history. The baseline migration describes the original checked-in schema; it is **not** a script to run against an existing populated database.

For an existing database, compare its schema to the baseline and resolve any drift first. Only when the baseline matches, mark it as already applied:

```powershell
npx prisma migrate resolve --applied 20261010000000_baseline
npx prisma migrate deploy
npx prisma generate
```

For a new empty database, run `npx prisma migrate deploy`, then `npx prisma generate`. Do not use `db reset`, `migrate reset` or `db push --accept-data-loss` on the existing database.

The upgrade is additive. It creates sessions and corporate actions and adds ledger revision, snapshot provenance, price dates and tax classification. Old snapshots default to stale. Existing instrument prices have no verified valuation date until refreshed. Existing tax classifications default to UNKNOWN.

The new server-only session/corporate-action tables enable RLS without public policies and revoke Supabase anon/authenticated access where those roles exist. Verify that Prisma connects as the table owner or an appropriate server role with BYPASSRLS. Audit the existing tables' Supabase grants and policies separately; those live settings cannot be inferred from the repository.

## Configuration and reconciliation

- Set server-only `PORTFIN_ADMIN_EMAILS` to the comma-separated email addresses of existing trusted accounts. The default grants nobody catalogue/manual-price administration. Never prefix this variable with NEXT_PUBLIC.
- Existing users must sign in again. Identity comes from an HttpOnly, Secure-in-production, SameSite=Lax session cookie, stored as a token hash on the server and revoked on sign-out.
- API writes reject cross-origin browser requests. Configure the deployment proxy to preserve the public request host/protocol so request URLs match the browser Origin.
- Refresh prices to populate dates and sources. Mutual funds require an exact verified ISIN; name matching and unverified predecessor stitching are disabled.
- Use Instrument Manager as an administrator to verify eligibility for equity/STT treatment. Other or unknown classifications, pre-2018 grandfathering, pre-23-July-2024 disposals and unverified fees withhold estimates. They require adviser review; the engine does not invent those treatments.
- Total transaction charges affect economic P&L. Store separately verified deductible charges, excluding STT, for tax computation. Blank deductible charges with positive total charges trigger review.
- Historical backfill uses month-end units and dated closing prices. Missing or stale prices skip a month without overwriting its snapshot. Stale/legacy snapshots remain visible in logs but are excluded from charts. Trade edits/deletions and corporate actions invalidate affected snapshots; rerun backfill after reconciliation.
- Previously rewritten split/bonus transactions cannot be automatically restored. Compare them with broker statements before recording new corporate actions or regenerating history. Corporate actions now preserve original trades and replay at their ex-dates.
- Export JSON is a PortFin reconciliation format, not a certified income-tax portal schema. Estimates cover supported equity capital gains and cess; other income, surcharge, personal exemptions and adviser adjustments require separate review.

## Validation limits

Unit/regression tests and the Next production build run without contacting or modifying the production database. PostgreSQL transaction/concurrency behavior, deployment cookie/proxy behavior, Supabase grants/RLS and provider results must also be checked in staging. Live Supabase policies are not available in this repository.

The initial Prisma DLL lock was resolved by briefly restarting the local PortFin development server. Prisma Client generation now completes successfully.

## Completed database migration — 10 October 2026

The configured Supabase database was migrated at the user's request. The live schema matched the original baseline exactly before migration. The baseline was registered as applied, and `20261010000100_p0_p1` was applied within a PostgreSQL transaction. Migration status is up to date and a live-schema comparison reports no differences.

A private application-table backup and introspected schema were saved under `.cache/migration-backups/2026-10-10T07-37-09-823Z-portfin.*` (ignored by Git). This is an application-table backup, not a full Supabase project backup. Exact canonical record fingerprints confirmed that existing field values were unchanged: 2 users, 2 portfolios, 44 instruments, 765 trades and 269 snapshots. The newly added tables are empty, owned by postgres and have RLS enabled; the configured server role has BYPASSRLS.

Migration commands used the Supabase session pooler on port 5432; the application's existing transaction-pooler connection was preserved. `scripts/migrateP0P1.mjs` contains the inspection, private backup, baseline, deployment and verification commands used. Prisma Client was regenerated and the local development server restarted on port 3000. Application deployment, administrator allowlist configuration, price refresh and historical reconciliation remain separate rollout steps.
