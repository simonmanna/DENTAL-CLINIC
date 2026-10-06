-- One ACTIVE invoice line per treatment procedure (see migration
-- 20261006120000_clinical_guards). Re-applied by PrismaService's boot hook so
-- the index appears as soon as duplicate lines have been reconciled; fails
-- (logged, non-fatal) while duplicates remain.
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_items_active_tp_unique"
  ON "invoice_items" ("treatmentProcedureId")
  WHERE "status" = 'ACTIVE' AND "treatmentProcedureId" IS NOT NULL;
