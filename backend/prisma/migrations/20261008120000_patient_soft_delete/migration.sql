-- Patient soft delete (2026-10-08). Idempotent: safe to re-run.
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "deletedReason" TEXT;
CREATE INDEX IF NOT EXISTS "patients_deletedAt_idx" ON "patients"("deletedAt");
