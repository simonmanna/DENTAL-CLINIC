import { 
  IsString, 
  IsOptional, 
  IsEnum, 
  IsArray, 
  IsInt,
  IsUrl,
  IsUUID,
  IsObject,
  IsNumber,
  ArrayMaxSize,
  IsDateString,
  IsNotEmpty
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ImagingType, ImagingStage, ImagingSource } from '@prisma/client'

export class CreateImagingRecordDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsOptional()
  appointmentId?: string;

  @IsString()
  @IsOptional()
  visitId?: string;

  @IsString()
  @IsOptional()
  dentistId?: string;

  @IsString()
  @IsOptional()
  procedureId?: string;

  @IsString()
  @IsOptional()
  chartEntryId?: string;

  @IsEnum(ImagingType)
  @IsNotEmpty()
  type: ImagingType;

  @IsEnum(ImagingStage)
  @IsOptional()
  stage?: ImagingStage;

  @IsEnum(ImagingSource)
  @IsOptional()
  source?: ImagingSource;

  @IsString()
  @IsOptional()
  groupId?: string;

  @IsUrl()
  @IsOptional()
  fileUrl?: string;

  @IsUrl()
  @IsOptional()
  thumbnailUrl?: string;

  @IsString()
  @IsOptional()
  storagePath?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsNumber()
  @IsOptional()
  fileSize?: number;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(v => parseInt(v, 10)).filter(v => !isNaN(v));
    if (typeof value === 'number') return [value];
    return [];
  })
  toothNumbers?: number[];

//   @IsArray()
//   @IsInt({ each: true })
//   @ArrayMaxSize(32)
//   @IsOptional()
//   toothNumbers?: number[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  findings?: string;

  @IsObject()
  @IsOptional()
  annotations?: any;

  @IsDateString()
  @IsOptional()
  takenAt?: string;
}