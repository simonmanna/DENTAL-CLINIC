-- prisma/sql/condition_procedure_links_active_unique.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent: drop and recreate the partial unique index that prevents a
-- single PatientCondition from being linked to the same TreatmentProcedure
-- twice while both links are ACTIVE (deletedAt IS NULL). The original code
-- comment in schema.prisma claimed this was enforced by a migration that
-- never shipped, leaving a real production-data integrity gap (Fix #3 /
-- X1 in the audit).
--
-- Prisma's @@unique cannot express a partial predicate, so the constraint
-- is enforced by raw SQL applied on app boot (see prisma.service.ts
-- onModuleInit hook). The SQL is fully idempotent (DROP IF EXISTS +
-- CREATE) so a deploy that ships twice does not error.
DROP INDEX IF EXISTS condition_procedure_links_active_unique;
CREATE UNIQUE INDEX condition_procedure_links_active_unique
  ON condition_procedure_links ("patientConditionId", "treatmentProcedureId")
  WHERE "deletedAt" IS NULL;