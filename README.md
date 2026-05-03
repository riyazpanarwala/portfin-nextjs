# PortFin — Personal Portfolio Dashboard

**PortFin** is a comprehensive, full-stack personal finance application for tracking Indian equity and mutual fund investments. Built with **Next.js 16.2.3**, **Tailwind CSS v4**, **Prisma 6**, and **PostgreSQL**, it delivers real-time analytics, FIFO-based P&L tracking, goal planning, and a local AI-powered portfolio advisor.

---

## ✨ Features

### Portfolio Tracking
- **Portfolio Overview** — Consolidated view with unrealized P&L, realized P&L, overall CAGR, XIRR, and portfolio health score
- **Mutual Funds** — Dedicated view with lot-wise breakup, monthly breakup, redemption history, XIRR per fund, and NAV chart
- **Equity Stocks** — Per-stock detail with lot-wise XIRR, win/loss stats, sell history with FIFO lot matching, inline CMP editor, and CSV export
- **FIFO P&L Engine** — Oldest lots consumed first on every sell; realized gain, tax type (LTCG/STCG), and matched lots tracked precisely
- **Realized P&L** — Separate tracking of closed-position gains alongside unrealized gains; full sell history per holding

### Analytics & Insights
- **Advanced Analytics** — Benchmark comparison (Nifty 50, Sensex, Midcap, Smallcap), unrealized tax liability, loss-harvesting assistant, monthly flow chart, holding period distribution, and sector rotation wheel with donut + radar charts
- **Investment Timeline** — Cumulative investment chart, monthly heatmap, full trade history grouped by month
- **Wealth Waterfall** — Visual breakdown of how capital transformed into current portfolio value
- **Action Signal** — Portfolio pulse, top gainer/loser, weekly investor checklist
- **Portfolio vs Nifty 50** — Snapshot-driven indexed comparison chart, rolling return comparison (6M/1Y/2Y/3Y), alpha tracking, and hypothetical growth table

### Planning Tools
- **Goal Planner** — SIP projections with flat and step-up SIP scenarios, milestone tracker, goal progress bar
- **Portfolio Rebalancer** — Target allocation sliders (MF / Stocks / ETF), current vs target comparison, rebalancing action plan with ₹ amounts

### Data Management
- **Trade Form** — Add buy/sell trades with instrument autocomplete from the DB; recent trades list with delete
- **Instrument Manager** — Search instruments from DB + NSE/BSE/ETF CSV static data with Yahoo Finance sector enrichment; add single instruments; bulk CSV import (BSE equity, NSE equity, ETF list); instrument browser table with pagination
- **Snapshot History** — Manual snapshot saving, snapshot table with full metrics, used by Portfolio vs Nifty 50 chart
- **Live Prices** — Stocks/ETFs refreshed from Yahoo Finance (6-hour cache); MF NAVs from AMFI on demand; manual CMP override per symbol

### AI Advisor
- **AI Portfolio Advisor** — Powered by **Ollama** (local, free, no API key); full portfolio context injected; streaming SSE responses; suggested prompts; markdown-formatted output

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

For the AI Portfolio Advisor (optional):
```env
OLLAMA_URL="http://localhost:11434"
OLLAMA_MODEL="llama3.2"
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

| Command              | Description                                         |
| :------------------- | :-------------------------------------------------- |
| `npm run db:push`    | Push schema to DB (no migration history)            |
| `npm run db:seed`    | Load NSE equities + AMFI funds + portfolio trades   |
| `npm run db:migrate` | Create a named migration (for production)           |
| `npm run db:reset`   | Drop all tables and re-seed ⚠️ destructive          |
| `npm run db:studio`  | Open Prisma Studio GUI                              |
| `npm run db:setup`   | Push + seed in one command                          |
| `npm run update-prices` | Run price update script via Yahoo Finance / AMFI |

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

## 🤖 AI Portfolio Advisor

Powered by [Ollama](https://ollama.com) — runs 100% locally, no API key or internet required.

**Setup:**
```bash
# 1. Install Ollama from https://ollama.com
# 2. Start the server
ollama serve
# 3. Pull a model (~2 GB)
ollama pull llama3.2
```

The advisor receives full portfolio context on every message: holdings, sector breakdown, CAGR, XIRR, realized P&L, and tax profile. Responses stream via SSE and render with markdown formatting.

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

### AI
| Method   | Endpoint           | Description                                      |
| :------- | :----------------- | :----------------------------------------------- |
| `POST`   | `/api/ai-advisor`  | Streaming AI advice via local Ollama (SSE)       |

---

## 📂 Key Source Files

| File | Purpose |
| :--- | :------ |
| `src/lib/store.js` | Core portfolio engine — FIFO, XIRR, CAGR, tax, formatters |
| `src/context/PortfolioContext.js` | React context — data loading, state, actions |
| `src/components/Dashboard.js` | Main shell — sidebar, header, view router |
| `src/components/views/` | One file per view (Overview, MF, Stocks, Analytics, etc.) |
| `src/components/charts/Charts.js` | Chart.js wrappers — donut, bar, line, sparkline, waterfall |
| `prisma/schema.prisma` | Database schema |
| `src/app/api/` | Next.js API routes |

---

## ⚠️ Important Notes

- **Tax figures are estimates** — consult a CA before filing. LTCG/STCG classification is based on calendar-day holding period per FIFO lot.
- **Nifty 50 data** in the comparison view uses approximate end-of-month closes hardcoded up to April 2026 — not a live feed.
- **Benchmark CAGR figures** in Analytics are as of early 2025 and may diverge.
- **AI advice** is for informational purposes only. PortFin is not a SEBI-registered investment advisor.
