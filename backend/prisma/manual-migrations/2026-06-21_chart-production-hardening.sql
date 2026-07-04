-- ───────────────────────────────────────────────────────────────────────────
-- Dental chart production-hardening migration (2026-06-21)
--
-- Apply with:
--   npx prisma db execute --file prisma/manual-migrations/2026-06-21_chart-production-hardening.sql --schema prisma/schema.prisma
--
-- Idempotent (IF NOT EXISTS guards) so it is safe to re-run, and safe to run
-- BEFORE or AFTER `prisma db push` (db push creates the columns + plain indexes
-- from schema.prisma; the PARTIAL UNIQUE index below can only be created here
-- because Prisma cannot express a WHERE-filtered unique index).
-- ───────────────────────────────────────────────────────────────────────────

-- E1: optimistic-lock token on patient conditions.
ALTER TABLE "patient_conditions" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- L2: per-catalog-condition auto-resolve flag (replaces hard-coded name list).
ALTER TABLE "conditions" ADD COLUMN IF NOT EXISTS "autoResolves" BOOLEAN NOT NULL DEFAULT true;

-- D2: indexes backing the lifecycle updateMany + getPatientEntries hot paths.
CREATE INDEX IF NOT EXISTS "ChartEntry_patientConditionId_idx" ON "ChartEntry" ("patientConditionId");
CREATE INDEX IF NOT EXISTS "ChartEntry_conditionId_idx"        ON "ChartEntry" ("conditionId");
CREATE INDEX IF NOT EXISTS "ChartEntry_patientId_type_status_idx" ON "ChartEntry" ("patientId", "type", "status");

-- D1 pre-step: reconcile pre-existing duplicate LIVE diagnoses so the unique
-- index below can be built. Keep the most recent live row per
-- (patient, tooth, condition) group; soft-delete the older duplicates (clinical
-- history is preserved — nothing is hard-deleted). Idempotent: after the first
-- run no live duplicates remain, so the CTE selects nothing.
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

-- Keep the chart consistent with the dedup: supersede ACTIVE chart entries that
-- pointed at a just-soft-deleted duplicate condition. No-op on re-run (those
-- rows are already SUPERSEDED).
UPDATE "ChartEntry" ce
SET "status" = 'SUPERSEDED'
FROM "patient_conditions" p
WHERE ce."patientConditionId" = p.id
  AND ce."status" = 'ACTIVE'
  AND p."deletedReason" = 'Auto-deduplicated: duplicate live diagnosis (chart hardening migration)';

-- D1: stop duplicate LIVE diagnoses of the same catalog condition on one tooth.
-- Scoped to non-deleted, clinically-live rows so a resolved/ruled-out/deleted
-- finding never blocks recording a fresh recurrence later. NULL toothNumber
-- (arch / mouth-level findings) is naturally exempt (NULLs are distinct).
CREATE UNIQUE INDEX IF NOT EXISTS "patient_conditions_live_unique"
  ON "patient_conditions" ("patientId", "toothNumber", "conditionId")
  WHERE "deletedAt" IS NULL AND "status" IN ('ACTIVE', 'MONITORED', 'IN_TREATMENT');

-- L2 data backfill: mark long-term / monitoring / presence-affecting findings
-- as non-auto-resolving (a single completed procedure must not "cure" them).
UPDATE "conditions"
SET "autoResolves" = false
WHERE "chartPresenceEffect" <> 'NONE'
   OR "name" IN (
        'Bruxism',
        'Chronic periodontitis',
        'Gingivitis, plaque induced',
        'Acute necrotizing ulcerative gingivitis',
        'Gingival recession',
        'Attrition of teeth',
        'Abrasion of teeth',
        'Erosion of teeth',
        'Malocclusion (unspecified)',
        'Dentine hypersensitivity',
        'Leukoplakia of oral mucosa',
        'Oral candidiasis (thrush)'
      );

-- UN-1: enforce unique Condition.name in the DB. The schema's @unique is
-- applied by `prisma db push` on a fresh DB; this migration is the idempotent
-- backfill for existing DBs. The pre-flight check below turns this into a
-- no-op if duplicates already exist (the schema's NOT-validation cannot be
-- added on top of duplicates without manual reconciliation).
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT "name" FROM "conditions"
      GROUP BY "name" HAVING COUNT(*) > 1
    ) d;
  IF dup_count = 0 THEN
    -- Safe to add the constraint.
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename  = 'conditions'
         AND indexname  = 'conditions_name_key'
    ) THEN
      -- Drop any pre-existing non-unique index on name (rare, but tidy).
      ALTER TABLE "conditions"
        ADD CONSTRAINT "conditions_name_key" UNIQUE ("name");
    END IF;
  ELSE
    RAISE NOTICE 'UN-1 skipped: % duplicate condition name(s) exist. Reconcile manually before re-running.', dup_count;
  END IF;
END $$;
