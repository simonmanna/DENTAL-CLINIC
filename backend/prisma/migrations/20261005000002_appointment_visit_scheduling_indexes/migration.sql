-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for the scheduling hot paths.
--
-- `appointments` and `visits` carried no secondary indexes at all, so every
-- screen that opens on a date — the calendar, the day list, today's stats, the
-- active-visit board — drove a sequential scan over the whole table, as did
-- the per-dentist overlap check that runs on every booking.
--
-- CONCURRENTLY is deliberately NOT used: Prisma Migrate wraps each migration
-- in a transaction, and CREATE INDEX CONCURRENTLY cannot run inside one. These
-- tables are small enough that the brief write lock is acceptable; on a large
-- installation, run the same statements by hand with CONCURRENTLY and then
-- `prisma migrate resolve --applied`.
-- ─────────────────────────────────────────────────────────────────────────────

-- Overlap detection: (dentistId, scheduledAt) range-scans directly.
CREATE INDEX IF NOT EXISTS "appointments_dentistId_scheduledAt_idx"
  ON "appointments" ("dentistId", "scheduledAt");

-- Day / week windows and the default ordering.
CREATE INDEX IF NOT EXISTS "appointments_scheduledAt_idx"
  ON "appointments" ("scheduledAt");

-- Status filters and the grouped day statistics.
CREATE INDEX IF NOT EXISTS "appointments_status_scheduledAt_idx"
  ON "appointments" ("status", "scheduledAt");

-- Patient timeline tab.
CREATE INDEX IF NOT EXISTS "appointments_patientId_scheduledAt_idx"
  ON "appointments" ("patientId", "scheduledAt");

-- Active-visit board and the visit list's default sort.
CREATE INDEX IF NOT EXISTS "visits_checkedInAt_idx"
  ON "visits" ("checkedInAt");

CREATE INDEX IF NOT EXISTS "visits_status_checkedInAt_idx"
  ON "visits" ("status", "checkedInAt");

CREATE INDEX IF NOT EXISTS "visits_patientId_checkedInAt_idx"
  ON "visits" ("patientId", "checkedInAt");

CREATE INDEX IF NOT EXISTS "visits_dentistId_checkedInAt_idx"
  ON "visits" ("dentistId", "checkedInAt");

-- Visit dashboard joins and the completion-time total recalculation.
CREATE INDEX IF NOT EXISTS "visit_procedures_visitId_idx"
  ON "visit_procedures" ("visitId");
