-- ───────────────────────────────────────────────────────────────────────────
-- Dental chart M-1 / M-2 production hardening (2026-06-23)
--   M-2  optimistic-lock `version` column on ChartEntry
--   M-1  RETAINED_ROOT value on the ChartPresenceEffect enum (root stump glyph)
--
-- Apply with:  npx prisma db execute --file prisma/manual-migrations/<this>.sql
-- (project uses hand-written SQL migrations — no `prisma migrate` history)
-- ───────────────────────────────────────────────────────────────────────────

-- ── M-2: ChartEntry optimistic-lock version column ─────────────────────────
ALTER TABLE "ChartEntry"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ── M-1: new presence effect for retained roots (crown lost, root in situ) ──
-- ADD VALUE IF NOT EXISTS is idempotent on PostgreSQL 12+. Must run outside an
-- explicit transaction block; `prisma db execute` runs each statement directly.
ALTER TYPE "ChartPresenceEffect" ADD VALUE IF NOT EXISTS 'RETAINED_ROOT';
