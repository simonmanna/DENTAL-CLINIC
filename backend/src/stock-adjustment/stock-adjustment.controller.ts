import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StockAdjustmentService } from './stock-adjustment.service';
import {
  CreateStockAdjustmentDto,
  ApproveAdjustmentDto,
} from './dto/stock-adjustment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
// Role gating.
//
// The global APP_GUARD chain authenticates every request, but RolesGuard is a
// no-op on a route carrying no @Roles metadata — so before this, any
// authenticated user at all could move stock. Writes are restricted to the
// roles that are accountable for inventory; reads stay open to any
// authenticated member of staff, matching PurchaseController. SUPER_ADMIN and
// ADMIN bypass every gate by design (see RolesGuard).
//
// Approval is narrower than creation: an adjustment is the one write that can
// create or destroy stock with no supporting document, and the service also
// refuses an approver who raised it.
@Controller('adjustments')
export class StockAdjustmentController {
  constructor(private readonly service: StockAdjustmentService) {}

  // GET /inventory/adjustments
  @Get()
  findAll(@Query() filter: any) {
    // ← Use `any` to bypass validation
    console.log('Query params:', filter);
    return this.service.findAll(filter);
  }

  // GET /inventory/adjustments/stats
  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  // GET /inventory/adjustments/search-items?query=xxx&locationId=yyy
  @Get('search-items')
  searchItems(
    @Query('query') query: string,
    @Query('locationId') locationId: string,
  ) {
    return this.service.searchItems(query ?? '', locationId);
  }

  // GET /inventory/adjustments/location-stock/:locationId
  @Get('location-stock/:locationId')
  getLocationStock(@Param('locationId') locationId: string) {
    return this.service.getLocationStock(locationId);
  }

  // GET /inventory/adjustments/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // POST /inventory/adjustments
  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStockAdjustmentDto, @Request() req: any) {
    // In production use req.user.id from JWT
    const performedById = req.user?.id ?? 'system';
    return this.service.create(dto, performedById);
  }

  // PATCH /inventory/adjustments/:id/approve
  @Patch(':id/approve')
  @Roles('SUPER_ADMIN', 'ADMIN')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveAdjustmentDto,
    @Request() req: any,
  ) {
    const approvedById = req.user?.id ?? 'system';
    return this.service.approve(id, dto, approvedById);
  }

  // PATCH /adjustments/:id/void — undoes an APPROVED adjustment
  @Patch(':id/void')
  @Roles('SUPER_ADMIN', 'ADMIN')
  void(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.service.void(id, reason, req.user?.id);
  }

  // PATCH /inventory/adjustments/:id/reject
  @Patch(':id/reject')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reject(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @Request() req: any,
  ) {
    const rejectedById = req.user?.id ?? 'system';
    return this.service.reject(id, body.notes ?? '', rejectedById);
  }
}
