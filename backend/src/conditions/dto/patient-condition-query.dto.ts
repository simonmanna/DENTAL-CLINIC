// src/modules/conditions/dto/patient-condition-query.dto.ts
import { IsOptional, IsUUID } from 'class-validator';

export class PatientConditionQueryDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  visitId?: string;
}