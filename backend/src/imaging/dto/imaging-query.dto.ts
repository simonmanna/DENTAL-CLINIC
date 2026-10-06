// backend/src/modules/imaging/dto/imaging-query.dto.ts
import {
  IsIn, IsOptional, IsString, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { ImagingType, ImagingStage } from '@prisma/client';

export class ImagingQueryDto {
  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsEnum(ImagingType)
  type?: ImagingType;

  @IsOptional()
  @IsEnum(ImagingStage)
  stage?: ImagingStage;

  @IsOptional()
  @IsString()
  groupId?: string;

  /** Images attached to one procedure session. */
  @IsOptional()
  @IsString()
  procedureSessionId?: string;

  /** 'true' → only images not attached to any session yet. */
  @IsOptional()
  @IsIn(['true', 'false'])
  unlinked?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string = 'takenAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  page?: string = '1';

  @IsOptional()
  @IsString()
  limit?: string = '20';
}
