import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteProcedureReasonDto {
  @ApiProperty({ description: 'Required reason for deleting the procedure' })
  @IsString()
  @IsNotEmpty({ message: 'Deletion reason is required' })
  reason: string;
}
