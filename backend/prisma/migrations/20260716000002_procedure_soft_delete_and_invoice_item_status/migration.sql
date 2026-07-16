-- Procedure soft-delete + invoice-item lifecycle status.
--
-- Completes the schema deltas for the "delete = soft-delete" refactor on
-- TreatmentProcedure and the ACTIVE/VOID lifecycle on invoice line items.
--
-- Every statement is guarded (IF NOT EXISTS / IF EXISTS) so the migration is
-- idempotent and safe on a populated production table: all column adds are
-- metadata-only on PostgreSQL 11+ (nullable columns, or a NOT NULL column with
-- a constant DEFAULT — no table rewrite / backfills every row in one statement).

-- 1. TreatmentStatus gains DELETED (soft-delete terminal state).
--    ADD VALUE is not used elsewhere in this migration, so it is safe inside
--    the transaction Prisma wraps around the file (PostgreSQL 12+).
ALTER TYPE "TreatmentStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- 2. Invoice line-item lifecycle status enum (created + used below).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceItemStatus') THEN
    CREATE TYPE "InvoiceItemStatus" AS ENUM ('ACTIVE', 'VOID');
  END IF;
END$$;

-- 3. Soft-delete audit columns on treatment_procedures.
ALTER TABLE "treatment_procedures"
  ADD COLUMN IF NOT EXISTS "deletedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "deletedReason" TEXT;

-- 4. Lifecycle status on invoice_items (voided items are kept for audit,
--    zeroed from invoice totals rather than hard-deleted).
ALTER TABLE "invoice_items"
  ADD COLUMN IF NOT EXISTS "status" "InvoiceItemStatus" NOT NULL DEFAULT 'ACTIVE';

-- 5. procedure_sessions -> treatment_procedures FK: Cascade -> SetNull.
--    TreatmentProcedures are soft-deleted, so this parent delete never fires in
--    normal operation; SetNull is the defensive action if a hard delete ever
--    happens out-of-band. (treatmentProcedureId remains NOT NULL — the action
--    is not expected to fire; mirrors the Prisma schema's onDelete: SetNull.)
ALTER TABLE "procedure_sessions"
  DROP CONSTRAINT IF EXISTS "procedure_sessions_treatmentProcedureId_fkey";
ALTER TABLE "procedure_sessions"
  ADD CONSTRAINT "procedure_sessions_treatmentProcedureId_fkey"
  FOREIGN KEY ("treatmentProcedureId") REFERENCES "treatment_procedures"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
