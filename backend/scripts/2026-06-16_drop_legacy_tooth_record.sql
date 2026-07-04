-- Drop the dead legacy dental-chart cluster (DentalChart/ToothRecord/
-- ToothProcedure + the ToothStatus enum). These were superseded by ChartEntry +
-- TreatmentProcedure + PatientCondition; on 2026-06-15 the last writer and reader
-- were removed and all references deleted. Verified pre-drop: no external FK
-- references the cluster; tooth_records/tooth_procedures held 0 rows, dental_charts
-- held 8 empty shells. Applied via `prisma db execute` (no clean migrate history).
-- Dropped child-first to respect the intra-cluster FKs.

DROP TABLE IF EXISTS "tooth_procedures";
DROP TABLE IF EXISTS "tooth_records";
DROP TABLE IF EXISTS "dental_charts";
DROP TYPE  IF EXISTS "ToothStatus";
