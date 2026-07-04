import { Module } from '@nestjs/common';
import { StockAdjustmentController } from './stock-adjustment.controller';
import { StockAdjustmentService } from './stock-adjustment.service';

@Module({
  controllers: [StockAdjustmentController],
  providers: [StockAdjustmentService]
})
export class StockAdjustmentModule {}
