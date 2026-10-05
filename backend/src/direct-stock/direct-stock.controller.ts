import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { DirectStockService } from './direct-stock.service';
import {
  DirectStockInDto,
  DirectStockOutDto,
  DirectStockQueryDto,
} from './dto/direct-stock.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// Role gating.
//
// The global APP_GUARD chain authenticates every request, but RolesGuard is a
// no-op on a route carrying no @Roles metadata — so before this, any
// authenticated user at all could move stock. Writes are restricted to the
// roles that are accountable for inventory; reads stay open to any
// authenticated member of staff, matching PurchaseController. SUPER_ADMIN and
// ADMIN bypass every gate by design (see RolesGuard).
@Controller('direct-stock')
export class DirectStockController {
  constructor(private readonly directStockService: DirectStockService) {}

  @Post('in')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  async stockIn(@Body() dto: DirectStockInDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.directStockService.stockIn(dto, userId);
  }

  @Post('out')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  async stockOut(@Body() dto: DirectStockOutDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.directStockService.stockOut(dto, userId);
  }

  @Patch('in/:id/void')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async voidStockIn(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.directStockService.voidStockIn(id, reason, req.user?.id);
  }

  @Get('history')
  async getHistory(@Query() query: DirectStockQueryDto) {
    return this.directStockService.getHistory({
      search: query.search,
      locationId: query.locationId,
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });
  }

  @Get('stats')
  async getStats(@Query('locationId') locationId?: string) {
    return this.directStockService.getStats(locationId);
  }

  @Get('location-stock/:locationId')
  async getLocationStock(@Param('locationId') locationId: string) {
    return this.directStockService.getLocationStock(locationId);
  }

  @Get('batches/:itemId')
  async getAvailableBatches(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.directStockService.getAvailableBatches(itemId, locationId);
  }
}
