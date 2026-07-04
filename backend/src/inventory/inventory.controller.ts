import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  InventoryQueryDto,
  CreateInventoryCategoryDto,
  UpdateInventoryCategoryDto,
} from './dto/inventory.dto';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../auth/roles.guard';

import { StockLedgerType } from '@prisma/client';

@Controller('inventory')
// @UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // STATIC / SPECIFIC ROUTES — MUST come BEFORE :id to avoid route conflicts
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Stats ──────────────────────────────────────────────────────────────
  @Get('stats')
  async getStats() {
    return this.inventoryService.getStats();
  }

  // ─── Reports ────────────────────────────────────────────────────────────
  @Get('reports/items')
  async getItemsReport(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('type') type?: string,
    @Query('isActive') isActive?: string,
    @Query('lowStock') lowStock?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getItemsReport({
      search,
      categoryId,
      supplierId,
      type,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      lowStock: lowStock === 'true',
      sortBy,
      sortOrder,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('reports/ledger')
  async getLedgerReport(
    @Query('search') search?: string,
    @Query('itemId') itemId?: string,
    @Query('locationId') locationId?: string,
    @Query('type') type?: StockLedgerType,
    @Query('referenceType') referenceType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getLedgerReport({
      search,
      itemId,
      locationId,
      type,
      referenceType,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES (static prefix — no conflict with :id)
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateInventoryCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Get('categories')
  async findAllCategories(@Query('flat') flat?: string) {
    if (flat === 'true') return this.inventoryService.findAllCategoriesFlat();
    return this.inventoryService.findAllCategories();
  }

  @Put('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryCategoryDto,
  ) {
    return this.inventoryService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  async deleteCategory(@Param('id') id: string) {
    return this.inventoryService.deleteCategory(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEMS — named sub-paths BEFORE :id
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('items')
  async findItems(@Query() query: InventoryQueryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('items/:itemId/batches')
  async getItemBatches(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
  ) {
    const batches = await this.inventoryService.getItemBatches(
      itemId,
      locationId,
    );
    return { batches };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY ITEMS — generic CRUD (these MUST be last)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get()
  async findAll(@Query() query: InventoryQueryDto) {
    return this.inventoryService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.create(dto);
  }

  // ⚠️ :id routes are LAST — this is critical for NestJS route matching
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventoryService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string) {
    return this.inventoryService.deactivate(id);
  }
}