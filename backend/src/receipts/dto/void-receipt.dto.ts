import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class VoidReceiptDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Void reason must be at least 3 characters' })
  voidReason: string;

  @IsOptional()
  @IsString()
  voidedBy?: string;
}
