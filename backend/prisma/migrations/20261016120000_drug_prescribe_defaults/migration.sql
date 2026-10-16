-- Drug quick-prescribe defaults (2026-10-16). Idempotent: safe to re-run.
ALTER TABLE "drugs" ADD COLUMN IF NOT EXISTS "isCommon" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drugs" ADD COLUMN IF NOT EXISTS "defaultDosage" TEXT;
ALTER TABLE "drugs" ADD COLUMN IF NOT EXISTS "defaultFrequency" TEXT;
ALTER TABLE "drugs" ADD COLUMN IF NOT EXISTS "defaultDuration" TEXT;
ALTER TABLE "drugs" ADD COLUMN IF NOT EXISTS "defaultRoute" TEXT;
ALTER TABLE "drugs" ADD COLUMN IF NOT EXISTS "defaultInstructions" TEXT;
CREATE INDEX IF NOT EXISTS "drugs_isCommon_idx" ON "drugs"("isCommon");
