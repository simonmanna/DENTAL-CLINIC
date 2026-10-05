import { Global, Module } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';

// Global for the same reason DocumentNumberModule is: every inventory-touching
// module needs it, and threading an import through each one adds nothing.
@Global()
@Module({
  providers: [StockMovementService],
  exports: [StockMovementService],
})
export class StockMovementModule {}
