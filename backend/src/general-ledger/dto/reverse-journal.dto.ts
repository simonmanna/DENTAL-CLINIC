import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ReverseJournalDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Reversal reason must be at least 3 characters' })
  reason: string;
}
