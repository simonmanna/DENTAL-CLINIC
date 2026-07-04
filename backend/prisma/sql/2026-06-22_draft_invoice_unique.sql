-- H4: prevent duplicate DRAFT invoices for the same (patient, visit, plan).
--
-- Why: InvoiceLifecycleService.getOrCreateDraft() does findFirst-then-create.
-- Two concurrent first-procedure adds on a brand-new visit both see "no draft"
-- and each create one. If both are later activated the visit is billed twice.
-- This partial unique index makes the second insert fail; the service catches
-- the unique violation (P2002) and returns the winning draft instead.
--
-- NULL visit/plan are collapsed to '-' so a patient-level draft (no visit, no
-- plan) is also unique. Only ACTIVE (non-deleted) DRAFT rows are constrained —
-- VOID/POSTED/soft-deleted invoices are unaffected.
--
-- Idempotent: IF NOT EXISTS. Safe to re-run.
--
-- ⚠️ PRE-CHECK — if pre-existing duplicates exist this CREATE will fail. Find
-- them first and void/merge the extras:
--
--   SELECT "patientId", COALESCE("visitId",'-') v, COALESCE("treatmentPlanId",'-') tp,
--          COUNT(*), array_agg(id)
--   FROM invoices
--   WHERE status = 'DRAFT' AND "deletedAt" IS NULL
--   GROUP BY 1,2,3 HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_draft
  ON invoices (
    "patientId",
    COALESCE("visitId", '-'),
    COALESCE("treatmentPlanId", '-')
  )
  WHERE status = 'DRAFT' AND "deletedAt" IS NULL;
