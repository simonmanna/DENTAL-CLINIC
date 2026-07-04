// src/financial-reporting/dto/financial-report-query.dto.ts
import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class FinancialReportQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() dentistId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() direction?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsNumber() @Type(() => Number) page?: number;
  @IsOptional() @IsNumber() @Type(() => Number) limit?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortOrder?: string;
  @IsOptional() @IsString() category?: string;
}
