import { Module } from '@nestjs/common';
import { StockLogService } from './stock-log.service';
import { StockLogController } from './stock-log.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StockLogController],
  providers: [StockLogService],
  exports: [StockLogService], // ← important so other modules can create logs
})
export class StockLogModule {}