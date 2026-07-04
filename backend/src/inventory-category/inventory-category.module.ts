import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryCategoryService } from './inventory-category.service';
import { InventoryCategoryController } from './inventory-category.controller';

@Module({
  imports: [PrismaModule],
  providers: [InventoryCategoryService],
  controllers: [InventoryCategoryController],
  exports: [InventoryCategoryService],
})
export class InventoryCategoryModule {}