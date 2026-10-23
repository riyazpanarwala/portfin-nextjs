# Daily price and snapshot automation

The workflow in `.github/workflows/daily-portfolio.yml` refreshes both mutual funds and stocks, then saves daily snapshots for all portfolios owned by one configured account. It runs at **11:47 PM IST, Monday–Saturday**, with no scheduled Sunday run, and can also be started from **Actions → Daily prices and portfolio snapshots → Run workflow**.

## One-time GitHub setup

1. Merge the workflow and supporting code into the repository's **default branch** (currently `main`; the working branch is `dev`). GitHub schedules run from the default branch.
2. Open **Settings → Secrets and variables → Actions**.
3. Add a repository **secret** named `DATABASE_URL` with the connection string for the same PostgreSQL database used by the deployed application. The database must accept connections from GitHub-hosted runners. Do not commit the connection string or `.env` file.
4. Add a repository **secret** named `PORTFOLIO_OWNER_EMAIL` with the email address used to sign in to the application. This must be a secret, since GitHub can display ordinary variables in a step's environment header. This limits automation to that account's portfolios. A missing or unmatched email fails the run rather than selecting other accounts.
5. Run the workflow manually once and review its step logs and summary. No live run is needed to install the files locally.

## Behavior

- Only active holdings in the selected account are refreshed. Instruments shared between portfolios are refreshed once. Empty portfolios are skipped.
- Uses the existing AMFI and Yahoo price services, FIFO engine, corporate actions, and snapshot validation.
- Saves one **automated** checkpoint per portfolio per IST day. Retries update that checkpoint; separate manual snapshots are preserved.
- Prices, price provenance, and snapshots use existing tables and columns. There are **no schema changes, migrations, seeding, or database resets**.
- Provider refresh failures prevent the affected portfolio from being snapshotted; other portfolios can still succeed. The workflow retries up to three times, then fails if any portfolio remains unsuccessful.
- Saturdays and holidays use the previous published close/NAV. A successful provider response can also contain the previous day's NAV if publication is pending. Individual dates are retained privately in the snapshot's price provenance; the workflow does not claim those are same-day prices. The existing seven-day freshness limit still applies. A price preceding a recorded split or bonus cannot be used for post-action units.
- Known delisted stocks retain their cached valuation and remain subject to snapshot freshness checks. Their prices are not fetched as listed securities.
- The app reads updated prices when it next loads portfolio data. An already-open browser view may need a page reload.
- GitHub schedules can be delayed; 11:47 PM IST is the requested start time, not a delivery guarantee. Review failed runs in the Actions tab.

## Public repository protections

- Public logs and summaries contain only the run date, aggregate counts, and generic status messages. Symbols, prices, balances, portfolio IDs, account emails, raw database/provider errors, and exception stacks are not printed. The database/provider worker's stdout and stderr are discarded; only an explicitly validated aggregate summary is passed to the public runner over IPC. Diagnose individual failures privately in the app or a trusted local database session.
- Both connection settings must be GitHub **secrets**. The workflow does not accept an email from a public variable. If an email was previously stored as a variable, remove that variable after adding the secret.
- Manual runs are allowed only on the repository's default branch. A dispatch on another branch skips the credentialed job. There are no pull-request triggers, the GitHub token has read-only repository access, and checkout credentials are not persisted.
- Official checkout/setup-node actions are pinned to verified release commit hashes. Review and update these pins when adopting newer releases.
- `.github/CODEOWNERS` assigns the workflow and its executable sources/dependencies to the repository owner. To **enforce** review, configure a default-branch ruleset in **Settings → Rules → Rulesets**: require pull requests and code-owner review, block force pushes and deletion, and restrict bypass permissions to trusted maintainers. The file alone does not enable branch protection; no remote rules have been changed by this implementation.
- Review who has write access: trusted repository code receives the database secret, and the read-only GitHub token does not restrict PostgreSQL permissions. Prefer a database credential with only the permissions this job requires; the owner-email filter is application logic, not a database security boundary. No database roles or grants are changed here.
- Public-repository schedules can be disabled after 60 days without repository activity. Check the Actions tab if updates stop.
- If earlier runs printed holding details, delete those runs/logs through Actions. Changing the code does not erase old logs. Rotate database credentials if an actual credential was exposed.

Reference: [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

## Local use

Set `DATABASE_URL` and `PORTFOLIO_OWNER_EMAIL` in the environment, then run `npm run snapshot:daily`. To load an existing local `.env` file, use `node --env-file=.env scripts/dailyPortfolioSnapshot.mjs`.

This command updates prices and saves snapshots in the configured database. The automated test suite uses fakes and never calls the live database or price providers.

Reference: [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).
