import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { StockOutService } from './stock-out.service';
import { CreateStockOutDto, QueryStockOutDto } from './dto/stock-out.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// Role gating.
//
// The global APP_GUARD chain authenticates every request, but RolesGuard is a
// no-op on a route carrying no @Roles metadata — so before this, any
// authenticated user at all could move stock. Writes are restricted to the
// roles that are accountable for inventory; reads stay open to any
// authenticated member of staff, matching PurchaseController. SUPER_ADMIN and
// ADMIN bypass every gate by design (see RolesGuard).
@Controller('stock-out')
export class StockOutController {
  constructor(private readonly stockOutService: StockOutService) {}

  // ─── Stats ─────────────────────────────────────────────────────────────────
  @Get('stats')
  async getStats(@Query('locationId') locationId?: string) {
    return this.stockOutService.getStats(locationId);
  }

  // ─── Location stock (for the form) ────────────────────────────────────────
  @Get('location-stock/:locationId')
  async getLocationStock(@Param('locationId') locationId: string) {
    return this.stockOutService.getLocationStock(locationId);
  }

  // ─── Available batches for a specific item+location ───────────────────────
  @Get('batches/:itemId')
  async getAvailableBatches(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.stockOutService.getAvailableBatches(itemId, locationId);
  }

  // ─── List ─────────────────────────────────────────────────────────────────
  @Get()
  async findAll(@Query() query: QueryStockOutDto) {
    return this.stockOutService.findAll(query);
  }

  // ─── Get one ──────────────────────────────────────────────────────────────
  // Voiding posts the inverse movement and returns the stock. Restricted to
  // the roles that can approve, not the ones that can issue.
  @Patch(':id/void')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async void(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.stockOutService.void(id, reason, req.user?.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.stockOutService.findOne(id);
  }

  // ─── Create ───────────────────────────────────────────────────────────────
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStockOutDto,
    // Replace with @CurrentUser() decorator from your JWT guard when auth is enabled
    // @Req() req: any,
  ) {
    const performedById = undefined; // req.user?.id
    return this.stockOutService.create(dto, performedById);
  }
}
