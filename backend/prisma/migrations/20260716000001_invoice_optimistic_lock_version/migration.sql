-- H6: optimistic-lock token for invoices.
--
-- Mirrors the `version Int @default(0)` columns already present on
-- treatment_procedures, procedure_sessions, chart_entries, expenses,
-- purchase_orders, suppliers, and patient_conditions.
--
-- Purpose: the service-layer atomic UPDATE statements (recalcInvoiceAtomicTx,
-- voidInvoice's guarded flip, addPayment's invoice credit) gate their write on
-- `WHERE version = $expectedVersion` and bump `version` in the same statement.
-- If 0 rows match, a concurrent edit landed first → surface a 409
-- ConflictException instead of silently overwriting the invoice's totals.
--
-- Adding a NOT NULL column with DEFAULT 0 is a metadata-only operation on
-- PostgreSQL 11+ (no table rewrite) and backfills every existing row in the
-- same statement, so this migration is safe to apply on a populated
-- production table at any time of day.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
