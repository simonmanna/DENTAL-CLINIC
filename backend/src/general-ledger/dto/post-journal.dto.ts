import {
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class JournalLineDto {
  @IsString()
  @IsNotEmpty()
  code: string; // chart-of-accounts code, e.g. "1100"

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

/** Manual general-journal posting (rent, salaries, corrections, …). */
export class PostJournalDto {
  @IsString()
  @IsNotEmpty()
  memo: string;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];

  @IsOptional()
  @IsString()
  patientId?: string;
}
