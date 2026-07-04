// src/conditions/dto/delete-patient-condition.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
// DELETE /conditions/patient/:id — clinical audit trail requires a non-empty
// reason. Defence-in-depth: the service layer also throws when reason is
// empty, but enforcing it at the controller via class-validator means a
// caller that omits the body (or sends `{}`) is rejected before any
// transaction opens.
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DeletePatientConditionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}