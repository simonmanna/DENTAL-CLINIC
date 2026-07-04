-- M-2: optimistic-lock column for ChartEntry.
-- Bumped on every mutation in versionedChartEntryUpdate(); when callers pass
-- expectedVersion the write is gated on it atomically (updateMany with
-- version match → 409 on conflict). Mirrors treatment_procedures.version.

ALTER TABLE "ChartEntry" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;