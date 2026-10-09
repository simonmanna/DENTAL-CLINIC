import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BACKUP_FREQUENCIES, RETENTION_CHOICES } from './backup.types';
import type { BackupFrequency } from './backup.types';

export class BackupScheduleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(BACKUP_FREQUENCIES)
  frequency?: BackupFrequency;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time must be HH:mm (24-hour)',
  })
  time?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsBoolean()
  catchUp?: boolean;
}

export class UpdateBackupSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(260)
  location?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BackupScheduleDto)
  schedule?: BackupScheduleDto;

  @IsOptional()
  @IsIn(RETENTION_CHOICES)
  keepDays?: number;

  @IsOptional()
  @IsBoolean()
  includeUploads?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  uploadsSource?: string;

  @IsOptional()
  @IsBoolean()
  pointInTimeEnabled?: boolean;
}

export class BackupNowDto {
  /** Omit to use the regular backup location. */
  @IsOptional()
  @IsString()
  @MaxLength(260)
  location?: string;

  @IsOptional()
  @IsBoolean()
  includeUploads?: boolean;
}

export class CheckLocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(260)
  path!: string;
}

export class CreateFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(260)
  parent!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
