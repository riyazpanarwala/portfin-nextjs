# Daily price and snapshot automation

The workflow in `.github/workflows/daily-portfolio.yml` refreshes both mutual funds and stocks, then saves daily snapshots for all portfolios owned by one configured account. It runs at **11:47 PM IST, Monday–Saturday**, with no scheduled Sunday run, and can also be started from **Actions → Daily prices and portfolio snapshots → Run workflow**.

## One-time GitHub setup

1. Merge the workflow and supporting code into the repository's **default branch** (currently `main`; the working branch is `dev`). GitHub schedules run from the default branch.
2. Open **Settings → Secrets and variables → Actions**.
3. Add a repository **secret** named `DATABASE_URL` with the connection string for the same PostgreSQL database used by the deployed application. The database must accept connections from GitHub-hosted runners. Do not commit the connection string or `.env` file.
4. Add a repository **secret** named `PORTFOLIO_OWNER_EMAIL` with the email address used to sign in to the application. A repository variable with the same name is also supported; the secret takes precedence when both are set. This limits automation to that account's portfolios. A missing or unmatched email fails the run rather than selecting other accounts.
5. Run the workflow manually once and review its step logs and summary. No live run is needed to install the files locally.

## Behavior

- Only active holdings in the selected account are refreshed. Instruments shared between portfolios are refreshed once. Empty portfolios are skipped.
- Uses the existing AMFI and Yahoo price services, FIFO engine, corporate actions, and snapshot validation.
- Saves one **automated** checkpoint per portfolio per IST day. Retries update that checkpoint; separate manual snapshots are preserved.
- Prices, price provenance, and snapshots use existing tables and columns. There are **no schema changes, migrations, seeding, or database resets**.
- Provider refresh failures prevent the affected portfolio from being snapshotted; other portfolios can still succeed. The workflow retries up to three times, then fails if any portfolio remains unsuccessful.
- Saturdays and holidays use the previous published close/NAV. A successful provider response can also contain the previous day's NAV if publication is pending. Dates are logged and retained in the snapshot's price provenance; the workflow does not claim those are same-day prices. The existing seven-day freshness limit still applies. A price preceding a recorded split or bonus cannot be used for post-action units.
- Known delisted stocks retain their cached valuation and remain subject to snapshot freshness checks. Their prices are not fetched as listed securities.
- The app reads updated prices when it next loads portfolio data. An already-open browser view may need a page reload.
- GitHub schedules can be delayed; 11:47 PM IST is the requested start time, not a delivery guarantee. Review failed runs in the Actions tab.

## Local use

Set `DATABASE_URL` and `PORTFOLIO_OWNER_EMAIL` in the environment, then run `npm run snapshot:daily`. To load an existing local `.env` file, use `node --env-file=.env scripts/dailyPortfolioSnapshot.mjs`.

This command updates prices and saves snapshots in the configured database. The automated test suite uses fakes and never calls the live database or price providers.

Reference: [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).
