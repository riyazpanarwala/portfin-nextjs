# PortFin — Personal Portfolio Dashboard

Full-stack Indian equity & mutual fund tracker — **Next.js 16.2.3 · Tailwind CSS v4 · Prisma 6 · PostgreSQL**

---

## ⚡ Quick Start

```bash
# 1. Install deps
npm install

# 2. Set your database
cp .env.example .env
#    Edit .env → set DATABASE_URL

# 3. Push schema + generate Prisma client
npx prisma generate
npx prisma db push

# 4. Seed instruments (from NSE + AMFI) and portfolio trades
npm run db:seed

# 5. Start the app
npm run dev
```

Open **http://localhost:3000**

---

## Database Commands

| Command | What it does |
|---------|-------------|
| `npm run db:push` | Push schema to DB (no migration history) |
| `npm run db:seed` | Load NSE equities + AMFI funds + all portfolio trades |
| `npm run db:migrate` | Create a named migration (for production) |
| `npm run db:reset` | Drop all tables and re-seed (⚠ destructive) |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:setup` | Push + seed in one command |

---

## .env

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/portfin"
```

---

## Seed Details

`prisma/seed.js` does **three things** automatically:

1. **Fetches NSE equity list** from `archives.nseindia.com/content/equities/EQUITY_L.csv`  
   → Upserts all NSE stocks as `Instrument` records (symbol, name, ISIN)

2. **Fetches AMFI NAV file** from `portal.amfiindia.com/spages/NAVAll.txt`  
   → Upserts all mutual fund schemes with live NAV as `Instrument` records

3. **Seeds portfolio trades** — every buy entry from `portfolio.xlsx`:  
   - 10 NSE Stocks (BPCL, BEL, COALINDIA, IRFC, ITC, JPPOWER, MAZDOCK, NBCC, NHPC, ONGC, RPOWER, SUZLON, VEDANTA)  
   - ETFs (MODEF, TATSILV, NIFTYBEES, JUNIORBEES)  
   - 10 Mutual Funds (Axis Large Cap, Axis Small Cap, Kotak Flexicap, Kotak Midcap, SBI Flexicap, SBI Large Cap, HSBC Small Cap, Nippon Small Cap, Parag Parikh, ABSL Value, DSP ELSS)  
   - ~650 individual buy transactions with exact dates and prices

Re-running seed clears existing trades and re-imports cleanly.

---

## Schema Changes (vs original)

| Change | Reason |
|--------|--------|
| Added `Instrument` model | Normalises symbol/name/ISIN/sector/exchange — no duplication across trades |
| `Trade.instrumentId` FK | Replaces `symbol` string — proper relational integrity |
| `Trade.brokerage` field | For accurate net P&L calculation |
| `Exchange` enum (NSE/BSE/AMFI) | Disambiguates instruments traded on multiple exchanges |
| `Snapshot @@unique([portfolioId, snapshotAt])` | Prevents duplicate snapshots |
| `Instrument.price` + `priceUpdatedAt` | Cached live price (MF NAV / stock CMP) |

---

## Live Prices

- **Mutual Funds**: `/api/prices` fetches live NAV from AMFI on every call (cached 1h in Next.js fetch cache)  
- **Stocks/ETFs**: Hit the ↺ Prices button in the header to manually refresh from stored price, or use `PATCH /api/prices { symbol, price }` to set CMP

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolio?userId=` | List portfolios |
| POST | `/api/portfolio` | Create portfolio |
| GET | `/api/trades?portfolioId=` | All trades (joined with instrument) |
| POST | `/api/trades` | Add trade (auto-upserts instrument) |
| DELETE | `/api/trades/:id` | Delete trade |
| PATCH | `/api/trades/:id` | Edit trade |
| GET | `/api/instruments?q=&assetType=` | Search instruments (autocomplete) |
| POST | `/api/prices` | Fetch live prices for symbols |
| PATCH | `/api/prices` | Override CMP for a symbol |
| GET | `/api/snapshots?portfolioId=` | Snapshot history |
| POST | `/api/snapshots` | Save snapshot |
