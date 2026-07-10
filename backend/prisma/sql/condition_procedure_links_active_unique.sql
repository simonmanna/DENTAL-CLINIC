-- prisma/sql/condition_procedure_links_active_unique.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Partial unique index: a PatientCondition can never be linked to the same
-- TreatmentProcedure twice while both links are ACTIVE (deletedAt IS NULL).
--
-- CANONICAL SOURCE: migration 20260710000001_partial_unique_indexes_and_checks
-- (`prisma migrate deploy` is the production path). This boot-applied copy is
-- only a safety net for dev databases created with `prisma db push`, which
-- does not run migrations. CREATE IF NOT EXISTS keeps re-boots cheap — no
-- drop/recreate churn and no unprotected window.
CREATE UNIQUE INDEX IF NOT EXISTS condition_procedure_links_active_unique
  ON condition_procedure_links ("patientConditionId", "treatmentProcedureId")
  WHERE "deletedAt" IS NULL;