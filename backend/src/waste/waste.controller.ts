import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WasteService } from './waste.service';
import {
  CreateWasteRecordDto,
  ApproveWasteRecordDto,
  QueryWasteRecordsDto,
} from './dto/create-waste.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('waste')
@UseGuards(JwtAuthGuard)
export class WasteController {
  constructor(private readonly wasteService: WasteService) {}

  /**
   * GET /api/waste/stats
   * Dashboard summary statistics
   */
  @Get('stats')
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'NURSE')
  async getStats(@Query('locationId') locationId?: string) {
    return this.wasteService.getStats(locationId);
  }

  /**
   * GET /api/waste/location-stock/:locationId
   * Returns all items with stock > 0 at a given location
   */
  @Get('location-stock/:locationId')
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'NURSE', 'RECEPTIONIST')
  async getLocationStock(@Param('locationId') locationId: string) {
    return this.wasteService.getLocationStock(locationId);
  }

  /**
   * GET /api/waste
   * List all waste records with filters
   */
  @Get()
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'NURSE')
  async findAll(@Query() query: QueryWasteRecordsDto) {
    return this.wasteService.findAll(query);
  }

  /**
   * POST /api/waste
   * Create a new waste record (PENDING approval)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'NURSE')
  async create(@Body() dto: CreateWasteRecordDto, @Request() req: any) {
    return this.wasteService.create(dto, req.user.id);
  }

  /**
   * GET /api/waste/:id
   * Get a single waste record detail
   */
  @Get(':id')
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'NURSE')
  async findOne(@Param('id') id: string) {
    return this.wasteService.findOne(id);
  }

  /**
   * PATCH /api/waste/:id/approve
   * Approve waste record → triggers stock deduction + stock log
   */
  @Patch(':id/approve')
  // @Roles('SUPER_ADMIN', 'ADMIN')
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveWasteRecordDto,
    @Request() req: any,
  ) {
    return this.wasteService.approve(id, dto, req.user.id);
  }

  /**
   * PATCH /api/waste/:id/reject
   * Reject waste record (no stock deduction)
   */
  @Patch(':id/reject')
  // @Roles('SUPER_ADMIN', 'ADMIN')
  async reject(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req: any,
  ) {
    return this.wasteService.reject(id, body.reason, req.user.id);
  }

  @Get('items/:itemId/batches')
  async getAvailableBatches(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.wasteService.getAvailableBatches(itemId, locationId);
  }
}
