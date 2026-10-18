-- Cash flow: account opening balance, payment → physical account link,
-- manual DEPOSIT / WITHDRAWAL cash-flow sources.
-- Written idempotent: safe to re-run.

-- 1. New CashFlowSource values for manual money movements.
ALTER TYPE "CashFlowSource" ADD VALUE IF NOT EXISTS 'DEPOSIT';
ALTER TYPE "CashFlowSource" ADD VALUE IF NOT EXISTS 'WITHDRAWAL';

-- 2. Opening balance per account (balance before the first recorded movement).
--    Existing rows kept their opening figure in currentBalance (never synced),
--    so carry it across.
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "openingBalance" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "accounts"
   SET "openingBalance" = "currentBalance"
 WHERE "openingBalance" = 0
   AND "currentBalance" <> 0;

-- 3. Payments record which physical account the money moved through.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "accountId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_accountId_fkey'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "payments_accountId_idx" ON "payments"("accountId");

-- 4. Backfill: invoice receipts already know the account they were paid into.
UPDATE "payments" p
   SET "accountId" = r."accountId"
  FROM "receipts" r
 WHERE r."paymentId" = p."id"
   AND r."accountId" IS NOT NULL
   AND p."accountId" IS NULL;
