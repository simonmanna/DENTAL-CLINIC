-- ProcedureSession.treatmentProcedureId: CASCADE → RESTRICT.
-- Sessions are immutable clinical history; hard-deleting a TreatmentProcedure
-- must be blocked (not silently cascade-delete executed sessions). Treatment
-- procedures are soft-deleted in application code anyway — this is a DB-level
-- backstop.

-- DropForeignKey
ALTER TABLE "procedure_sessions" DROP CONSTRAINT "procedure_sessions_treatmentProcedureId_fkey";

-- AddForeignKey
ALTER TABLE "procedure_sessions" ADD CONSTRAINT "procedure_sessions_treatmentProcedureId_fkey" FOREIGN KEY ("treatmentProcedureId") REFERENCES "treatment_procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
