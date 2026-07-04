// src/billing-services/dto/update-billing-service.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateBillingServiceDto } from './create-billing-service.dto';

export class UpdateBillingServiceDto extends PartialType(CreateBillingServiceDto) {}

