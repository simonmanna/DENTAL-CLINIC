import { Module } from '@nestjs/common';
import { DrugCategoriesService } from './drug-categories.service';
import { DrugCategoriesController } from './drug-category.controller';
import { PrismaModule } from '../prisma/prisma.module'; // Adjust path

@Module({
  imports: [PrismaModule],
  providers: [DrugCategoriesService],
  controllers: [DrugCategoriesController],
  exports: [DrugCategoriesService], // Export if other modules need it
})
export class DrugCategoryModule {}