// src/stock-log/stock-log.controller.ts
import { 
  Controller, 
  Get, 
  Query, 
  Param, 
  UseGuards,
  BadRequestException,  // ✅ Added for error handling
} from '@nestjs/common';
import { StockLogService } from './stock-log.service';
import { GetStockLogsDto } from './dto/get-stock-logs.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole, StockLedgerType } from '@prisma/client';  // ✅ Added StockLedgerType
import { Public } from '../auth/decorators/public.decorator';

@Controller('stock-logs')
@Public()
export class StockLogController {
  constructor(private readonly stockLogService: StockLogService) {}

  @Get()
  @Public()
  async findAll(@Query() dto: GetStockLogsDto) {
    return this.stockLogService.getStockLogs(dto);
  }

  // ✅ FIXED: Simplified method with inline enum parsing
  @Get('item/:itemId')
  async getItemLedger(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId?: string,
    @Query('type') typeQuery?: string,  // ✅ String from URL, e.g. "USAGE,SALE"
  ) {
    // ✅ Parse comma-separated type values into StockLedgerType[]
    let typeFilter: StockLedgerType[] | undefined;
    
    if (typeQuery) {
      typeFilter = typeQuery
        .split(',')
        .map(t => t.trim().toUpperCase())
        .filter(t => Object.values<string>(StockLedgerType).includes(t))
        .map(t => t as StockLedgerType);
      
      // Optional: Throw error if no valid types found
      if (typeFilter.length === 0) {
        throw new BadRequestException(
          `Invalid transaction type. Valid values: ${Object.values(StockLedgerType).join(', ')}`
        );
      }
    }

    // ✅ Call service with correct params
    return this.stockLogService.getItemLedger(itemId, locationId, typeFilter);
  }

  // ✅ BONUS: Query by reference (polymorphic pattern)
  @Get('reference/:referenceType/:referenceId')
  async getByReference(
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
  ) {
    return this.stockLogService.getByReference(referenceType, referenceId);
  }

  // ✅ BONUS: Item stock summary
  @Get('item/:itemId/summary')
  async getItemSummary(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
    @Query('days') days?: string,
  ) {
    if (!locationId) {
      throw new BadRequestException('locationId is required for summary');
    }
    return this.stockLogService.getItemStockSummary(
      itemId, 
      locationId, 
      days ? parseInt(days, 10) : undefined
    );
  }
}