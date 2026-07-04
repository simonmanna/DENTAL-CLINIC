import { Module } from '@nestjs/common';
import { DirectStockService } from './direct-stock.service';
import { DirectStockController } from './direct-stock.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DirectStockController],
  providers: [DirectStockService],
  exports: [DirectStockService],
})
export class DirectStockModule {}
