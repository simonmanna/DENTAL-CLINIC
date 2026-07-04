-- Wire ImagingRecord.chartEntryId / procedureId as real foreign keys so imaging
-- (X-ray / bitewing / OPG / CBCT / intraoral photo) is chart-linked with
-- referential integrity. The columns already exist on imaging_records; this only
-- adds the FK constraints (onDelete SET NULL) + supporting indexes so a chart
-- entry / procedure delete null-sets the link instead of orphaning the image.
--
-- Matches the Prisma relations added in schema.prisma (ImagingRecord.chartEntry
-- / .procedure). Idempotent — safe to re-run.
--
-- Apply against the DENTAL database (NOT the POS DB):
--   npx prisma db execute \
--     --file prisma/sql/2026-07-02_imaging_chart_procedure_fk.sql \
--     --schema prisma/schema.prisma

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'imaging_records_chart_entry_fkey'
  ) THEN
    ALTER TABLE "imaging_records"
      ADD CONSTRAINT "imaging_records_chart_entry_fkey"
      FOREIGN KEY ("chartEntryId") REFERENCES "ChartEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'imaging_records_procedure_fkey'
  ) THEN
    ALTER TABLE "imaging_records"
      ADD CONSTRAINT "imaging_records_procedure_fkey"
      FOREIGN KEY ("procedureId") REFERENCES "procedures"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "imaging_records_chartEntryId_idx"
  ON "imaging_records" ("chartEntryId");
CREATE INDEX IF NOT EXISTS "imaging_records_procedureId_idx"
  ON "imaging_records" ("procedureId");
