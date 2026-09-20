# PortFin — Personal Portfolio Dashboard

**PortFin** is a comprehensive, full-stack personal finance application for tracking Indian equity and mutual fund investments. Built with **Next.js 16.3.2**, **Tailwind CSS v4**, **Prisma 6**, and **PostgreSQL**, it delivers real-time analytics, FIFO-based P&L tracking, goal planning, and a Google Gemini AI-powered portfolio advisor.

---

## ✨ Features

### Portfolio Tracking
- **Portfolio Overview** — Consolidated view with unrealized P&L, realized P&L, overall CAGR, XIRR, and portfolio health score
- **Mutual Funds** — Dedicated view with lot-wise breakup, monthly breakup, redemption history, XIRR per fund, and NAV chart
- **Equity Stocks** — Per-stock detail with lot-wise XIRR, win/loss stats, sell history with FIFO lot matching, inline CMP editor, and CSV export
- **Equity Valuation & Fundamentals** — Live P/E, Forward P/E, P/B, ROE %, Debt/Equity, Market Cap Class (Large/Mid/Small), and risk flags via Yahoo Finance (on-demand, zero DB storage)
- **Corporate Actions Engine** — 1-click execution for Stock Splits (1:N), Bonus Issues (N:M), and Reverse Splits with live lot preview; preserves holding tax clocks (LTCG/STCG) and cost basis without DB schema changes
- **FIFO P&L Engine** — Oldest lots consumed first on every sell; realized gain, tax type (LTCG/STCG), and matched lots tracked precisely
- **Realized P&L** — Separate tracking of closed-position gains alongside unrealized gains; full sell history per holding

### Analytics & Insights
- **Advanced Analytics** — Benchmark comparison (Nifty 50, Sensex, Midcap, Smallcap), unrealized tax liability, loss-harvesting assistant, monthly flow chart, holding period distribution, and sector rotation wheel with donut + radar charts
- **Portfolio Beta & Risk Engine** — Live calculation of Portfolio Beta and volatility vs Nifty 50 benchmark
- **Year-by-Year P&L Breakdown** — Annualized performance, capital deployed, and yearly gain breakdown
- **Investment Timeline** — Cumulative investment chart, monthly heatmap, full trade history grouped by month
- **Wealth Waterfall** — Visual breakdown of how capital transformed into current portfolio value
- **Action Signal** — Portfolio pulse, top gainer/loser, weekly investor checklist
- **Portfolio vs Nifty 50** — Snapshot-driven indexed comparison chart, rolling return comparison (6M/1Y/2Y/3Y), alpha tracking, and hypothetical growth table

### Planning Tools
- **Goal Planner** — SIP projections with flat and step-up SIP scenarios, milestone tracker, goal progress bar
- **Portfolio Rebalancer** — Target allocation sliders (MF / Stocks / ETF), current vs target comparison, rebalancing action plan with ₹ amounts

### Data Management
- **Trade Importer** — Bulk trade importer for broker CSV exports (Zerodha, Groww, ICICI Direct, custom CSVs) with column mapping and validation
- **Snapshot Backfiller** — Generate backfilled point-in-time portfolio snapshot history across custom date ranges for rolling returns and Portfolio vs Nifty comparison
- **Trade Form** — Add buy/sell trades with instrument autocomplete from the DB; recent trades list with delete
- **Instrument Manager** — Search instruments from DB + NSE/BSE/ETF CSV static data with Yahoo Finance sector enrichment; add single instruments; bulk CSV import (BSE equity, NSE equity, ETF list); instrument browser table with pagination
- **Snapshot History** — Manual snapshot saving, snapshot table with full metrics, used by Portfolio vs Nifty 50 chart
- **Live Prices** — Stocks/ETFs refreshed from Yahoo Finance (6-hour cache); MF NAVs from AMFI on demand; manual CMP override per symbol

### AI Advisor
- **AI Portfolio Advisor** — Powered by **Google Gemini API** (`gemini-3.6-flash`); internal Next.js Server Action architecture with zero public REST endpoints; full portfolio context injected; suggested prompts; markdown-formatted output

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Set DATABASE_URL to your PostgreSQL connection string
```

For the AI Portfolio Advisor:
```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.6-flash"
```

### 3. Database Setup
```bash
npx prisma generate
npx prisma db push
```

### 4. Seed Initial Data
```bash
npm run db:seed
```
Seeds NSE equity list, AMFI fund NAVs, and sample portfolio trades from `prisma/portfolio.xlsx`.

### 5. Run the App
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## ⚙️ Database Commands

| Command                      | Description                                         |
| :--------------------------- | :-------------------------------------------------- |
| `npm run db:push`            | Push schema to DB (no migration history)            |
| `npm run db:seed`            | Load NSE equities + AMFI funds + portfolio trades   |
| `npm run db:migrate`         | Create a named migration (for production)           |
| `npm run db:reset`           | Drop all tables and re-seed ⚠️ destructive          |
| `npm run db:studio`          | Open Prisma Studio GUI                              |
| `npm run db:setup`           | Push + seed in one command                          |
| `npm run update-prices`      | Run price update script via Yahoo Finance / AMFI    |
| `npm run update-prices-stocks` | Refresh stock & ETF prices via Yahoo Finance     |
| `npm run update-prices-mf`   | Refresh mutual fund NAVs via AMFI                   |
| `npm run update-instruments` | Update local instrument lookup static data          |
| `npm run update-instruments:watch` | Watch and auto-update instrument static files  |

---

## 🌱 Seed Details

`prisma/seed.js` automates initial data population:

1. **NSE Equity List** — Fetches from `archives.nseindia.com/content/equities/EQUITY_L.csv` and upserts all NSE stocks (symbol, name, ISIN)
2. **AMFI NAV File** — Downloads from `portal.amfiindia.com/spages/NAVAll.txt` and upserts all mutual fund schemes with live NAVs
3. **Portfolio Trades** — Imports buy transactions from `prisma/portfolio.xlsx` including NSE stocks, ETFs, and mutual funds with exact dates and prices

Re-running the seed clears existing trades and re-imports cleanly.

---

## 📊 Data Model

| Model          | Description                                                                   |
| :------------- | :---------------------------------------------------------------------------- |
| `User`         | User accounts                                                                 |
| `Portfolio`    | A user's portfolio, linked to `User`                                          |
| `Instrument`   | Stocks, ETFs, and mutual funds — symbol, ISIN, name, sector, exchange, cached price |
| `Trade`        | Buy/sell transactions linked to `Portfolio` and `Instrument`                  |
| `Snapshot`     | Point-in-time portfolio metrics (value, invested, gain, return %, CAGR, etc.) |

**Exchanges supported:** `NSE`, `BSE`, `AMFI`  
**Asset types:** `STOCK`, `MF`  
**Trade types:** `BUY`, `SELL`

---

## 🧮 Portfolio Engine

The core engine (`src/lib/store.js`) uses production-grade calculations:

- **FIFO Sell Matching** — Each sell consumes the oldest lots first; holding days per matched lot determine LTCG vs STCG tax treatment
- **Realized vs Unrealized P&L** — Tracked separately; realized gain is never mixed into remaining position cost basis
- **XIRR** — Newton-Raphson solver for money-weighted returns; computed per holding (lot-level and fund-level) and portfolio-wide
- **CAGR** — Weighted by invested amount across holdings
- **Tax Computation** — LTCG at 12.5% with ₹1.25L annual exemption; STCG at 20%; computed on both realized and unrealized gains

---

## 📈 Live Prices

| Source          | Asset Types  | Behaviour                                          |
| :-------------- | :----------- | :------------------------------------------------- |
| Yahoo Finance   | STOCK, ETF   | Fetched on page load if stale (> 6 hours); forced refresh available |
| AMFI NAVAll.txt | MF           | Fetched on explicit refresh; cached NAV used on page load |
| Manual override | Any          | `PATCH /api/prices` or inline CMP editor in Stocks view |
| Last trade price | Any         | Fallback when no other price source is available   |

---

## 🧪 Testing & Verification

| Command | Description |
| :--- | :--- |
| `npm test` | Run 11 automated unit & integration tests (`test/engine/*.test.js`) via Node's native test runner |
| `npm run test:gemini` | Run live Google Gemini API connectivity & JSON verification script with masked credentials |
| `npm run lint` | Run ESLint across codebase |
| `npm run build` | Compile Next.js production build with Turbopack |

---

## 🤖 AI Portfolio Advisor

Powered by [Google Gemini](https://ai.google.dev/) via the official `@google/genai` SDK and Next.js Server Actions.

- **Architecture:** 100% internal execution via Next.js Server Action (`askGeminiAction`) with built-in CSRF protection and origin validation. Zero public REST API routes are exposed, preventing external scraping or direct API abuse.
- **Default Model:** `gemini-3.6-flash` (configurable via `GEMINI_MODEL` environment variable).
- **Security & Secret Redaction:** `GEMINI_API_KEY` stays strictly server-side. Automatic redaction ensures API keys are never leaked in error messages or client responses.
- **Context Injection:** On every query, the advisor receives comprehensive portfolio context (holdings, sector weightings, CAGR, XIRR, realized gains, and LTCG/STCG tax profiles).
- **Structured Output Support:** Includes helper utilities to safely extract and parse structured JSON responses with automatic markdown code fence stripping.

**Configuration:**
Add your Gemini API key to `.env`:
```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.6-flash"
```

Verify live connectivity anytime:
```bash
npm run test:gemini
```

---

## 🌐 API Reference

### Portfolio
| Method   | Endpoint                        | Description                          |
| :------- | :------------------------------ | :----------------------------------- |
| `GET`    | `/api/portfolio?userId=`        | List portfolios for a user           |
| `POST`   | `/api/portfolio`                | Create a new portfolio               |

### Trades
| Method   | Endpoint                        | Description                          |
| :------- | :------------------------------ | :----------------------------------- |
| `GET`    | `/api/trades?portfolioId=`      | All trades for a portfolio           |
| `POST`   | `/api/trades`                   | Add a trade (auto-upserts instrument)|
| `DELETE` | `/api/trades/:id`               | Delete a trade                       |
| `PATCH`  | `/api/trades/:id`               | Edit a trade                         |

### Instruments
| Method   | Endpoint                                         | Description                                        |
| :------- | :----------------------------------------------- | :------------------------------------------------- |
| `GET`    | `/api/instruments?q=&assetType=`                 | Autocomplete search (symbol/name)                  |
| `GET`    | `/api/instruments/search?q=&exchange=&enrich=`   | Advanced search — DB + CSV static data + Yahoo enrichment |
| `POST`   | `/api/instruments/bulk`                          | Bulk upsert instruments                            |
| `DELETE` | `/api/instruments/bulk`                          | Delete instrument (blocked if trades reference it) |

### Prices
| Method   | Endpoint          | Description                                         |
| :------- | :---------------- | :-------------------------------------------------- |
| `POST`   | `/api/prices`     | Fetch/refresh prices for symbols (Yahoo + AMFI)     |
| `PATCH`  | `/api/prices`     | Manual CMP override for a symbol                    |

### Snapshots
| Method   | Endpoint                            | Description                         |
| :------- | :---------------------------------- | :---------------------------------- |
| `GET`    | `/api/snapshots?portfolioId=&limit=`| Retrieve snapshot history           |
| `POST`   | `/api/snapshots`                    | Save a portfolio snapshot           |

### Fundamentals & Corporate Actions
| Method   | Endpoint                  | Description                                                  |
| :------- | :------------------------ | :----------------------------------------------------------- |
| `POST`   | `/api/fundamentals`       | Live valuation ratios (P/E, P/B, ROE, Debt/Eq) & market cap class |
| `POST`   | `/api/corporate-actions`  | Preview and execute Stock Splits, Bonus Shares, & Reverse Splits |

### Analytics & Benchmarks
| Method   | Endpoint                                   | Description                                                     |
| :------- | :----------------------------------------- | :-------------------------------------------------------------- |
| `GET`    | `/api/nifty-history?benchmark=&from=&to=`  | Historical index candles via Upstox API (Nifty 50, Sensex, etc) |
| `POST`   | `/api/portfolio-beta`                      | Dynamic calculation of Portfolio Beta vs Nifty 50               |
| `POST`   | `/api/backfill-snapshots`                  | Backfill point-in-time snapshot histories across date ranges    |

### Auth
| Method   | Endpoint          | Description                                      |
| :------- | :---------------- | :----------------------------------------------- |
| `POST`   | `/api/auth/login` | User authentication & session login             |

### AI (Internal Server Action)
Gemini AI inference runs strictly internal via Next.js Server Action (`askGeminiAction`) with CSRF protection, ensuring zero public REST endpoint exposure.

---

## 📂 Key Source Files

| File | Purpose |
| :--- | :------ |
| `src/services/ai/geminiService.js` | Core generic Gemini service (`@google/genai`, prompt validation, redaction, JSON parser) |
| `src/app/actions/gemini.js` | Internal Next.js Server Action (`askGeminiAction`) with CSRF protection |
| `src/lib/ai/geminiClient.js` | Client-side helper (`askGemini`) invoking the Server Action |
| `src/components/views/AIAdvisorView.js` | AI Advisor chat interface with full portfolio context injection |
| `test/engine/gemini.test.js` | 11 automated unit & integration tests using Node's native test runner |
| `scripts/testGemini.mjs` | Live Gemini API connectivity verification script with key masking |
| `src/lib/store.js` | Core portfolio engine — FIFO, XIRR, CAGR, tax, formatters |
| `src/context/PortfolioContext.js` | React context — data loading, state, actions |
| `src/components/Dashboard.js` | Main shell — sidebar, header, view router |
| `src/components/views/FundamentalsPanel.js` | Equity valuation summary KPIs & fundamentals table |
| `src/components/views/CorporateActionModal.js` | Corporate action interactive preview & execution modal |
| `src/components/views/TradeImporter.js` | Broker CSV trade importer component |
| `src/components/views/BackfillView.js` | Snapshot backfilling tool component |
| `src/components/views/YearByYearView.js` | Annualized P&L breakdown component |
| `src/components/views/` | One file per view (Overview, MF, Stocks, Analytics, etc.) |
| `src/components/charts/Charts.js` | Chart.js wrappers — donut, bar, line, sparkline, waterfall |
| `src/app/api/fundamentals/route.js` | On-demand equity fundamentals & valuation API |
| `src/app/api/corporate-actions/route.js` | Corporate actions engine API (Splits, Bonus, Reverse Split) |
| `src/app/api/nifty-history/route.js` | Live index candle API via Upstox |
| `src/app/api/portfolio-beta/route.js` | Portfolio Beta calculation API |
| `prisma/schema.prisma` | Database schema |
| `src/app/api/` | Next.js API routes |

---

## ⚠️ Important Notes

- **Tax figures are estimates** — consult a CA before filing. LTCG/STCG classification is based on calendar-day holding period per FIFO lot.
- **Nifty 50 historical benchmark data** can be fetched live via the Upstox integration (`/api/nifty-history`) or fall back to pre-packaged historical closes.
- **Benchmark CAGR figures** in Analytics are as of early 2025 and may diverge over time.
- **AI advice** is for informational purposes only. PortFin is not a SEBI-registered investment advisor.

## Income Tax Export

In **Tax**, select a single financial year and choose **Export for Income Tax**. Review the preview, explicitly verify each instrument's tax eligibility, then download `portfin-tax-export-FY2026-27.json`. Existing Tax-tab calculations and Schedule exports are unchanged.

This version-1 local JSON contract wraps `computeCapitalGainsReport` and retains its matched FIFO lots, dates, quantities, rounded proceeds/cost/gain, instrument identifiers, separate gross gains/losses and reconciliation counts. It contains no final tax liability, credentials, Prisma structures or account IDs. The same contract can later be served through an authenticated API; no API or database coupling was added.

PortFin does not store STT conditions or equity-oriented-fund eligibility. Unverified instruments default to review. Explicit eligible-equity confirmation maps consistent short/long lots to 111A/112A; verified other short-term lots use otherSTCG; verified general LTCG uses 112 (in the otherLTCG summary). Classifications apply only to the export. Do not confirm a whole instrument if its exported lots have mixed tax treatment.

Calendar-anniversary disagreements, grandfathering, capital losses, unmatched sales and possible 1,000-trade loading truncation require review. Corporate-action adjustments are consumed from existing FIFO, not recalculated; users must verify their legal cost/date treatment. FIFO groups by symbol and does not preserve broker/account-level provenance. The current UI loads one portfolio; this is not a consolidated multi-account tax ledger.

The Income Tax Calculator currently accepts only FY 2026-27 and at most 100 supported gains. Other FY exports are available for reconciliation but cannot be imported there until verified rules exist. In that calculator, choose **Capital gains → Import from PortFin**, review and confirm replacement (or explicit first-import merge). Losses and unresolved classifications withhold the estimate. Final tax is calculated only by the Income Tax Calculator; verify the final return before filing.

`buildIncomeTaxExport(holdings, { fy, classifications, trades })` is the pure adapter apart from its generation timestamp. Optional classifications are an explicit per-symbol user attestation (`equity`, `otherSTCG`, `112`); omission means review. Pass raw trades when available for sale-quantity completeness checks. `classifyForIncomeTax(sell, lot, decision)` is deterministic. No internal holdings or trades are serialized wholesale.

Tests: `test/engine/taxExport.test.js` covers empty FY, equity categories, losses, lots/instruments, filtering, adjusted corporate-action lots, schema keys, review boundaries, privacy, and unchanged engine results. The IncomeTax repository contains a synthetic JSON fixture generated with this exporter and importer/engine integration tests.

If a browser does not save downloads, use **Copy JSON** or **View JSON**, then **Paste PortFin JSON** in the calculator. This local fallback uses the same contract, validation and preview. The in-app browser did not save downloads during verification; the real portfolio round trip was verified using the visible JSON fallback.
