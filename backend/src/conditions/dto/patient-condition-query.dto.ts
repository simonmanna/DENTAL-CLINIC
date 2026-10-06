// src/modules/conditions/dto/patient-condition-query.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Ids in this schema are cuids (`@default(cuid())`), never UUIDs. `@IsUUID()`
// here rejected every real patient id with a 400, which left the patient
// Conditions tab silently empty.
export class PatientConditionQueryDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  visitId?: string;
}
