// update-inventory-category.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateInventoryCategoryDto } from './create-inventory-category.dto';

export class UpdateInventoryCategoryDto extends PartialType(CreateInventoryCategoryDto) {}