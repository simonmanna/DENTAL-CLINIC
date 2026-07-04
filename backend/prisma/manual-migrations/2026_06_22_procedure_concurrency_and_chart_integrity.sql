-- ───────────────────────────────────────────────────────────────────────────
-- Procedure workflow production hardening (2026-06-22)
--   H2  optimistic-locking `version` columns on procedures + sessions
--   M3  partial unique index: ≤1 ACTIVE PLANNED chart entry per (procedure, tooth)
--
-- Apply with:  npx prisma db execute --file prisma/manual-migrations/<this>.sql
-- (project uses hand-written SQL migrations — no `prisma migrate` history)
-- ───────────────────────────────────────────────────────────────────────────

-- ── H2: optimistic-lock version columns ────────────────────────────────────
ALTER TABLE "treatment_procedures"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "procedure_sessions"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ── M3: chart-integrity guard ──────────────────────────────────────────────
-- Invariant: a treatment procedure may have at most ONE ACTIVE PLANNED chart
-- entry per tooth. This catches a buggy / interrupted path that double-creates
-- the planned marker (the symptom of the add-procedure idempotency bug fixed in
-- C1) without touching COMPLETED entries — multi-session procedures legitimately
-- record one COMPLETED entry per session on the same tooth, so COMPLETED is NOT
-- constrained here. NULL toothNumber (mouth-level) rows are exempt (NULLs are
-- distinct in a unique index).
--
-- Defensive de-dupe first so the index can be created over existing data
-- (mirrors the prior chart-hardening migration that failed on live duplicates).
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
