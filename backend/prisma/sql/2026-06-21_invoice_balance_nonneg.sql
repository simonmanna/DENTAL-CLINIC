-- Enforce non-negative invoice balances at the database.
--
-- Why: the application guards against overpayment (a) at the service layer
-- with an atomic UPDATE that refuses to credit past the remaining balance,
-- and (b) at the UI layer with a friendly 400. Both are bypassable — direct
-- DB writes, a future backfill script, or a service bug could push balance
-- negative. The DB CHECK is the last line of defence: any write that would
-- result in balance < 0 is rejected with a constraint violation.
--
-- Idempotent: skips creation if a constraint of the same name already exists.
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_balance_nonneg'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_balance_nonneg
      CHECK (balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_base_balance_nonneg'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_base_balance_nonneg
      CHECK ("baseBalance" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_amount_paid_nonneg'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_amount_paid_nonneg
      CHECK ("amountPaid" >= 0);
  END IF;
END $$;
