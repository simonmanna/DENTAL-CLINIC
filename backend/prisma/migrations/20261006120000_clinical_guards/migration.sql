-- ─────────────────────────────────────────────────────────────────────────────
-- Clinical guards (2026-10-06)
--
-- 1. progress_reports: audit actors + soft delete (schema.prisma delta).
-- 2. The two clinical partial unique indexes that the consolidated baseline
--    (20261005120100_sql_objects_and_constraints) left out. They existed only
--    in prisma/manual-migrations/, so a fresh `migrate deploy` produced a
--    database that accepted duplicate live diagnoses on a tooth and duplicate
--    PLANNED chart markers for one procedure.
-- 3. One ACTIVE invoice line per treatment procedure — the structural guard
--    against billing a procedure twice (restore / drift-repair / retries).
-- 4. visit_procedures soft delete + actor; invoice_items.visitProcedureId so
--    an ad-hoc visit procedure's invoice line can be found and reversed.
--
-- Hand-maintained. Every statement is idempotent: safe to re-run, and safe
-- over a database that already received (2) from the manual migrations.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 1. progress_reports — actors + soft delete                                │
-- ╰───────────────────────────────────────────────────────────────────────────╯
ALTER TABLE "progress_reports" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "progress_reports" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "progress_reports" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "progress_reports" ADD COLUMN IF NOT EXISTS "deletedReason" TEXT;
ALTER TABLE "progress_reports" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

CREATE INDEX IF NOT EXISTS "progress_reports_deletedAt_idx"
  ON "progress_reports"("deletedAt");

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 2a. One LIVE diagnosis of a catalog condition per tooth                   │
-- ╰───────────────────────────────────────────────────────────────────────────╯
-- Pre-step: reconcile existing duplicates so the index can be built. Keep the
-- most recent live row per (patient, tooth, condition); soft-delete the older
-- ones (history preserved, nothing hard-deleted). No-op once clean.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "patientId", "toothNumber", "conditionId"
           ORDER BY "createdAt" DESC, id DESC
         ) AS rn
  FROM "patient_conditions"
  WHERE "deletedAt" IS NULL
    AND "toothNumber" IS NOT NULL
    AND "status" IN ('ACTIVE', 'MONITORED', 'IN_TREATMENT')
)
UPDATE "patient_conditions" p
SET "deletedAt" = now(),
    "deletedReason" = 'Auto-deduplicated: duplicate live diagnosis (chart hardening migration)'
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- Keep the chart consistent with the dedup.
UPDATE "ChartEntry" ce
SET "status" = 'SUPERSEDED'
FROM "patient_conditions" p
WHERE ce."patientConditionId" = p.id
  AND ce."status" = 'ACTIVE'
  AND p."deletedReason" = 'Auto-deduplicated: duplicate live diagnosis (chart hardening migration)';

-- Resolved / ruled-out / deleted findings never block a fresh recurrence.
-- NULL toothNumber (mouth-level findings) is exempt (NULLs are distinct).
CREATE UNIQUE INDEX IF NOT EXISTS "patient_conditions_live_unique"
  ON "patient_conditions" ("patientId", "toothNumber", "conditionId")
  WHERE "deletedAt" IS NULL AND "status" IN ('ACTIVE', 'MONITORED', 'IN_TREATMENT');

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 2b. ≤ 1 ACTIVE PLANNED chart marker per (procedure, tooth)                │
-- ╰───────────────────────────────────────────────────────────────────────────╯
-- COMPLETED is deliberately not constrained: multi-session procedures record
-- one COMPLETED row per session on the same tooth.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "treatmentProcedureId", "toothNumber"
           ORDER BY "createdAt" DESC, "id" DESC
         ) AS rn
  FROM "ChartEntry"
  WHERE "status" = 'ACTIVE'
    AND "type" = 'PLANNED'
    AND "treatmentProcedureId" IS NOT NULL
    AND "toothNumber" IS NOT NULL
)
UPDATE "ChartEntry" e
SET "status" = 'SUPERSEDED'
FROM ranked
WHERE e."id" = ranked."id"
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "chart_entry_active_planned_proc_tooth_uq"
  ON "ChartEntry" ("treatmentProcedureId", "toothNumber")
  WHERE "status" = 'ACTIVE'
    AND "type" = 'PLANNED'
    AND "treatmentProcedureId" IS NOT NULL
    AND "toothNumber" IS NOT NULL;

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 3. ≤ 1 ACTIVE invoice line per treatment procedure                        │
-- ╰───────────────────────────────────────────────────────────────────────────╯
-- Money rows are never auto-deduplicated: if duplicates exist the index is
-- skipped with a NOTICE, `scripts/repair-clinical-drift.ts` lists them for a
-- credit note / manual void, and PrismaService's boot hook retries the index
-- (prisma/sql/invoice_items_active_tp_unique.sql) once the data is clean.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT "treatmentProcedureId"
    FROM "invoice_items"
    WHERE "status" = 'ACTIVE' AND "treatmentProcedureId" IS NOT NULL
    GROUP BY "treatmentProcedureId"
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "invoice_items_active_tp_unique"
      ON "invoice_items" ("treatmentProcedureId")
      WHERE "status" = 'ACTIVE' AND "treatmentProcedureId" IS NOT NULL;
  ELSE
    RAISE NOTICE 'invoice_items_active_tp_unique skipped: % procedure(s) have more than one ACTIVE invoice line. Run scripts/repair-clinical-drift.ts.', dup_count;
  END IF;
END $$;

-- ╭───────────────────────────────────────────────────────────────────────────╮
-- │ 4. visit_procedures — soft delete; invoice_items.visitProcedureId         │
-- ╰───────────────────────────────────────────────────────────────────────────╯
ALTER TABLE "visit_procedures" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "visit_procedures" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "visit_procedures" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "visit_procedures" ADD COLUMN IF NOT EXISTS "deletedReason" TEXT;
CREATE INDEX IF NOT EXISTS "visit_procedures_deletedAt_idx"
  ON "visit_procedures"("deletedAt");

ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "visitProcedureId" TEXT;
CREATE INDEX IF NOT EXISTS "invoice_items_visitProcedureId_idx"
  ON "invoice_items"("visitProcedureId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_visitProcedureId_fkey'
  ) THEN
    ALTER TABLE "invoice_items"
      ADD CONSTRAINT "invoice_items_visitProcedureId_fkey"
      FOREIGN KEY ("visitProcedureId") REFERENCES "visit_procedures"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
