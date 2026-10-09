import { Global, Module } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { PrescriptionStockService } from './prescription-stock.service';

// Global for the same reason DocumentNumberModule is: every inventory-touching
// module needs it, and threading an import through each one adds nothing.
@Global()
@Module({
  providers: [StockMovementService, PrescriptionStockService],
  exports: [StockMovementService, PrescriptionStockService],
})
export class StockMovementModule {}
