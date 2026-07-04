import { PartialType } from '@nestjs/swagger';
import { CreateDrugCategoryDto } from './create-drug-category.dto';

export class UpdateDrugCategoryDto extends PartialType(CreateDrugCategoryDto) {}