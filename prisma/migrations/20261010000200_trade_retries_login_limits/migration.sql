BEGIN;

CREATE TABLE "trade_submissions" (
  "portfolio_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "trade_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trade_submissions_pkey" PRIMARY KEY ("portfolio_id", "key"),
  CONSTRAINT "trade_submissions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trade_submissions_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "trade_submissions_trade_id_idx" ON "trade_submissions"("trade_id");

CREATE TABLE "login_rate_limits" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "login_rate_limits_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "login_rate_limits_expires_at_idx" ON "login_rate_limits"("expires_at");

ALTER TABLE "trade_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_rate_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "trade_submissions", "login_rate_limits" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "trade_submissions", "login_rate_limits" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "trade_submissions", "login_rate_limits" FROM authenticated;
  END IF;
END $$;

COMMIT;
