-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('MF', 'STOCK');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "Exchange" AS ENUM ('NSE', 'BSE', 'AMFI');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Portfolio',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "exchange" "Exchange" NOT NULL,
    "asset_type" "AssetType" NOT NULL,
    "price" DECIMAL(12,4),
    "price_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "trade_type" "TradeType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(12,4) NOT NULL,
    "brokerage" DECIMAL(10,4),
    "trade_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "total_value" DECIMAL(18,2) NOT NULL,
    "total_invested" DECIMAL(18,2) NOT NULL,
    "total_gain" DECIMAL(18,2) NOT NULL,
    "total_return_pct" DECIMAL(8,2) NOT NULL,
    "total_realized_gain" DECIMAL(18,2),
    "mf_cagr" DECIMAL(8,2),
    "st_cagr" DECIMAL(8,2),
    "mf_invested" DECIMAL(18,2),
    "st_invested" DECIMAL(18,2),
    "fund_count" INTEGER,
    "stock_count" INTEGER,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_isin_key" ON "instruments"("isin");

-- CreateIndex
CREATE INDEX "instruments_symbol_idx" ON "instruments"("symbol");

-- CreateIndex
CREATE INDEX "instruments_asset_type_idx" ON "instruments"("asset_type");

-- CreateIndex
CREATE INDEX "instruments_exchange_asset_type_idx" ON "instruments"("exchange", "asset_type");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_symbol_exchange_key" ON "instruments"("symbol", "exchange");

-- CreateIndex
CREATE INDEX "trades_portfolio_id_idx" ON "trades"("portfolio_id");

-- CreateIndex
CREATE INDEX "trades_portfolio_id_instrument_id_idx" ON "trades"("portfolio_id", "instrument_id");

-- CreateIndex
CREATE INDEX "trades_trade_date_idx" ON "trades"("trade_date");

-- CreateIndex
CREATE INDEX "snapshots_portfolio_id_snapshot_at_idx" ON "snapshots"("portfolio_id", "snapshot_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "snapshots_portfolio_id_snapshot_at_key" ON "snapshots"("portfolio_id", "snapshot_at");

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
