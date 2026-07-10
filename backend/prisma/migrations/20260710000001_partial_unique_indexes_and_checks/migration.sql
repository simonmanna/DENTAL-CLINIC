-- ─────────────────────────────────────────────────────────────────────────────
-- Fold the boot-applied SQL constraints into migration history (canonical),
-- and add the session-number uniqueness that closes the duplicate-session
-- race in executeSession.
--
-- Prisma's @@unique cannot express partial predicates, hence raw SQL.
-- Everything here is idempotent — safe on a database that already received
-- these constraints from the PrismaService boot hook.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Dedupe any pre-existing duplicate ACTIVE session numbers so the unique
--    index can be created. Keeps the earliest row per (procedure, number);
--    later duplicates are soft-voided, preserving clinical history.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "treatmentProcedureId", "sessionNumber"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM procedure_sessions
  WHERE "deletedAt" IS NULL
)
UPDATE procedure_sessions ps
SET "deletedAt"     = NOW(),
    "deletedReason" = 'Auto-voided: duplicate sessionNumber (migration 20260710000001)'
FROM ranked r
WHERE ps.id = r.id
  AND r.rn > 1;

-- 2. One ACTIVE (non-soft-deleted) session per (procedure, sessionNumber).
--    Two concurrent create-and-execute requests that both compute max+1 now
--    collide here; the loser is replayed via its Idempotency-Key or surfaced
--    as a 409.
CREATE UNIQUE INDEX IF NOT EXISTS procedure_sessions_active_session_number_unique
  ON procedure_sessions ("treatmentProcedureId", "sessionNumber")
  WHERE "deletedAt" IS NULL;

-- 3. Dedupe duplicate ACTIVE condition↔procedure links (pre-fix data),
--    keeping the newest link per pair.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "patientConditionId", "treatmentProcedureId"
           ORDER BY "createdAt" DESC, id DESC
         ) AS rn
  FROM condition_procedure_links
  WHERE "deletedAt" IS NULL
)
UPDATE condition_procedure_links l
SET "deletedAt"     = NOW(),
    "deletedReason" = 'Auto-unlinked: duplicate active link (migration 20260710000001)'
FROM ranked r
WHERE l.id = r.id
  AND r.rn > 1;

-- 4. One ACTIVE link per (patientCondition, treatmentProcedure). Previously
--    applied only at app boot from
--    prisma/sql/condition_procedure_links_active_unique.sql.
CREATE UNIQUE INDEX IF NOT EXISTS condition_procedure_links_active_unique
  ON condition_procedure_links ("patientConditionId", "treatmentProcedureId")
  WHERE "deletedAt" IS NULL;

-- 5. Non-negative invoice balance CHECKs. Previously applied only at app boot
--    from prisma/sql/2026-06-21_invoice_balance_nonneg.sql.
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
