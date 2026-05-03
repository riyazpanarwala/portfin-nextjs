# PortFin — Personal Portfolio Dashboard

**PortFin** is a comprehensive, full-stack personal finance application designed for tracking Indian equity and mutual fund investments. Built with **Next.js 16.2.3**, **Tailwind CSS v4**, **Prisma 6**, and **PostgreSQL**, it offers real-time analytics, goal planning, and an integrated AI-powered portfolio advisor.

## ✨ Features

PortFin provides a rich set of features to manage and analyze your investment portfolio:

*   **Portfolio Overview:** A consolidated view of your investments.
*   **Mutual Funds & Equity Stocks:** Dedicated sections for detailed tracking of both asset classes.
*   **Advanced Analytics:** In-depth analysis of portfolio performance, including investment timeline, wealth waterfall, and action signals.
*   **Goal Planner:** Tools to set and track financial goals.
*   **Portfolio Rebalancer:** Assists in maintaining desired asset allocation.
*   **Portfolio vs. Nifty 50:** Benchmark your portfolio's performance against the Nifty 50 index.
*   **AI Portfolio Advisor:** Powered by **Ollama**, this feature offers local, private, and free AI-driven insights and recommendations for your portfolio.
*   **Instrument Manager:** Comprehensive management of all your investment instruments (stocks, ETFs, mutual funds) from NSE, BSE, and AMFI.
*   **Snapshot History:** Track your portfolio's value over time with historical snapshots.
*   **Trade Management:** Easily add, edit, and delete trade transactions.
*   **Live Price Updates:** Fetches real-time prices for stocks/ETFs from Yahoo Finance and Mutual Fund NAVs from AMFI.

## 🚀 Quick Start

Follow these steps to get your PortFin application up and running locally:

1.  **Install Dependencies:**

    ```bash
    npm install
    ```

2.  **Environment Setup:**

    Create a `.env` file by copying the example and configure your PostgreSQL database connection string.

    ```bash
    cp .env.example .env
    # Edit .env and set your DATABASE_URL
    ```

    If you plan to use the AI Portfolio Advisor, ensure Ollama is running and configured:

    ```env
    # .env
    OLLAMA_URL="http://localhost:11434" # Default Ollama URL
    OLLAMA_MODEL="llama3.2" # Or your preferred Ollama model
    ```

3.  **Database Schema & Client Generation:**

    Push the Prisma schema to your database and generate the Prisma client.

    ```bash
    npx prisma generate
    npx prisma db push
    ```

4.  **Seed Initial Data:**

    Seed the database with instrument data (NSE, AMFI) and sample portfolio trades from `prisma/portfolio.xlsx`.

    ```bash
    npm run db:seed
    ```

5.  **Start the Application:**

    ```bash
    npm run dev
    ```

    Open your browser to `http://localhost:3000`.

## ⚙️ Database Commands

| Command            | Description                                      |
| :----------------- | :----------------------------------------------- |
| `npm run db:push`  | Push schema to DB (no migration history)         |
| `npm run db:seed`  | Load NSE equities + AMFI funds + all portfolio trades |
| `npm run db:migrate` | Create a named migration (for production)        |
| `npm run db:reset` | Drop all tables and re-seed (⚠️ destructive) |
| `npm run db:studio`| Open Prisma Studio GUI                           |
| `npm run db:setup` | Push + seed in one command                       |

## 🌱 Seed Details

The `prisma/seed.js` script automates the initial population of your database:

1.  **Fetches NSE Equity List:** Retrieves the latest equity list from `archives.nseindia.com/content/equities/EQUITY_L.csv` and upserts all NSE stocks as `Instrument` records (symbol, name, ISIN).
2.  **Fetches AMFI NAV File:** Downloads the AMFI NAV file from `portal.amfiindia.com/spages/NAVAll.txt` and upserts all mutual fund schemes with live NAVs as `Instrument` records.
3.  **Seeds Portfolio Trades:** Imports sample buy transactions from `prisma/portfolio.xlsx`, including various NSE Stocks, ETFs, and Mutual Funds, with exact dates and prices.

Re-running the seed script will clear existing trades and re-import data cleanly.

## 📊 Data Model Overview

The application's data model is managed by Prisma and includes the following core entities:

*   **User:** Manages user accounts.
*   **Portfolio:** Represents a user's investment portfolio, linked to `User`.
*   **Instrument:** Stores details of stocks, ETFs, and mutual funds, including symbol, ISIN, name, sector, exchange, and cached price.
*   **Trade:** Records individual buy/sell transactions, linked to `Portfolio` and `Instrument`.
*   **Snapshot:** Captures historical portfolio performance metrics like total value, invested amount, and gain.

## 📈 Live Prices

PortFin ensures your portfolio data is up-to-date with dynamic price fetching:

*   **Mutual Funds:** Live NAVs are fetched from AMFI via `/api/prices` on every call (cached for 1 hour in Next.js fetch cache).
*   **Stocks/ETFs:** Prices are refreshed from Yahoo Finance. You can manually refresh prices via the UI or use the `PATCH /api/prices` API endpoint to set the current market price (CMP) for a symbol.

## 🤖 AI Portfolio Advisor

The AI Portfolio Advisor integrates with **Ollama** to provide local, privacy-focused investment insights. To use this feature:

1.  **Download Ollama:** Visit [ollama.com](https://ollama.com) to download and install the Ollama server.
2.  **Run Ollama Server:** Start the server with `ollama serve`.
3.  **Pull a Model:** Download a language model, e.g., `ollama pull llama3.2`.

Ollama typically listens on `http://localhost:11434`. Ensure this URL is correctly configured in your `.env` file.

## 🌐 API Reference

PortFin exposes a set of API endpoints for managing portfolio data:

| Method | Endpoint                       | Description                                   |
| :----- | :----------------------------- | :-------------------------------------------- |
| `GET`  | `/api/portfolio?userId=`       | List portfolios for a user                    |
| `POST` | `/api/portfolio`               | Create a new portfolio                        |
| `GET`  | `/api/trades?portfolioId=`     | Retrieve all trades for a portfolio           |
| `POST` | `/api/trades`                  | Add a new trade (auto-upserts instrument)     |
| `DELETE` | `/api/trades/:id`              | Delete a specific trade                       |
| `PATCH` | `/api/trades/:id`              | Edit an existing trade                        |
| `GET`  | `/api/instruments?q=&assetType=` | Search instruments by symbol/name (autocomplete) |
| `GET`  | `/api/instruments/search?q=&exchange=&enrich=` | Advanced instrument search with enrichment |
| `POST` | `/api/instruments/bulk`        | Bulk create/update instruments                |
| `DELETE` | `/api/instruments/bulk`        | Delete an instrument (if no trades reference it) |
| `POST` | `/api/prices`                  | Fetch live prices for specified symbols       |
| `PATCH` | `/api/prices`                  | Override current market price for a symbol    |
| `GET`  | `/api/snapshots?portfolioId=`  | Retrieve snapshot history for a portfolio     |
| `POST` | `/api/snapshots`               | Save a new portfolio snapshot                 |
| `POST` | `/api/ai-advisor`              | Get AI-driven portfolio insights (Ollama)     |

---

**PortFin** is designed to be a powerful and flexible tool for personal investment management, providing a robust backend and an intuitive user interface.
