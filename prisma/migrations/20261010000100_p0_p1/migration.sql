BEGIN;

-- AlterTable
ALTER TABLE "portfolios" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "instruments" ADD COLUMN     "price_as_of" DATE,
ADD COLUMN     "price_source" TEXT,
ADD COLUMN     "tax_category" TEXT NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "tax_brokerage" DECIMAL(10,4);

-- AlterTable
ALTER TABLE "snapshots" ADD COLUMN     "engine_version" TEXT,
ADD COLUMN     "ledger_revision" INTEGER,
ADD COLUMN     "price_provenance" JSONB,
ADD COLUMN     "stale" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "valuation_at" DATE;

-- CreateTable
CREATE TABLE "sessions" (
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "corporate_actions" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "ratio_numerator" DECIMAL(18,6) NOT NULL,
    "ratio_denominator" DECIMAL(18,6) NOT NULL,
    "ex_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corporate_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "corporate_actions_portfolio_id_ex_date_idx" ON "corporate_actions"("portfolio_id", "ex_date");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_actions_portfolio_id_instrument_id_action_type_ex_key" ON "corporate_actions"("portfolio_id", "instrument_id", "action_type", "ex_date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- These server-only tables must not inherit public access through Supabase's
-- REST API. Prisma must connect as the table owner or a role with BYPASSRLS.
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "corporate_actions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sessions", "corporate_actions" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "sessions", "corporate_actions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "sessions", "corporate_actions" FROM authenticated;
  END IF;
END $$;

COMMIT;
