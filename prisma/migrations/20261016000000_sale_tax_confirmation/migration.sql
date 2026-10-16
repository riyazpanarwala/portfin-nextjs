ALTER TABLE "trades"
ADD COLUMN "stt_eligible" BOOLEAN,
ADD COLUMN "tax_category" TEXT,
ADD COLUMN "tax_eligibility_confirmed_at" TIMESTAMP(3);
