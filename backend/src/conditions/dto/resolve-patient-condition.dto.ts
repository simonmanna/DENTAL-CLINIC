import { IsOptional, IsString } from 'class-validator';

export class ResolvePatientConditionDto {
  @IsOptional()
  @IsString()
  procedureId?: string;
}
