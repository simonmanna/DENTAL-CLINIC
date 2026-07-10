import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { StockTransferService } from '../stock-transfer/stock-transfer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationResponseDto } from './dto/location-response.dto';
import { LocationTreeDto } from './dto/location-tree.dto';

@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly stockTransferService: StockTransferService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@Body() dto: CreateLocationDto): Promise<LocationResponseDto> {
    return this.locationsService.create(dto);
  }

  @Get()
  async findAll(
    @Query('type') type?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ): Promise<LocationResponseDto[]> {
    return this.locationsService.findAll({
      type,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get('tree')
  async getTree(): Promise<LocationTreeDto[]> {
    return this.locationsService.findTree();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<LocationResponseDto> {
    return this.locationsService.findOne(id);
  }

  @Get(':id/breadcrumbs')
  async getBreadcrumbs(@Param('id') id: string) {
    return this.locationsService.getBreadcrumbs(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<LocationResponseDto> {
    return this.locationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.locationsService.remove(id);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(
    @Body() updates: Array<{ id: string; parentId?: string; sortOrder: number }>,
  ) {
    return this.locationsService.reorderLocations(updates);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @Body() dto: { fromLocationId: string; toLocationId: string; notes?: string; performedBy?: string; items: Array<{ drugId?: string; itemId?: string; quantity: number }> },
  ) {
    if (!dto.items?.length) throw new BadRequestException('At least one item is required');

    const enrichedItems = await Promise.all(
      dto.items.map(async (item) => {
        const id = item.drugId || item.itemId;
        if (!id) throw new BadRequestException('Each item must have drugId or itemId');

        const invItem = await this.prisma.inventoryItem.findUnique({
          where: { id },
          select: { id: true, name: true, unit: true },
        });
        if (!invItem) throw new NotFoundException(`Item ${id} not found`);

        return {
          inventoryItemId: invItem.id,
          itemName: invItem.name,
          unit: invItem.unit,
          quantityRequested: item.quantity,
        };
      }),
    );

    return this.stockTransferService.create(
      {
        fromLocationId: dto.fromLocationId,
        toLocationId: dto.toLocationId,
        notes: dto.notes,
        items: enrichedItems,
      },
      dto.performedBy || 'system',
    );
  }

  @Get('movements')
  async getMovements(
    @Query('fromLocationId') fromLocationId?: string,
    @Query('toLocationId') toLocationId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const where: any = {};
    if (fromLocationId) where.fromLocationId = fromLocationId;
    if (toLocationId) where.toLocationId = toLocationId;
    if (type) where.type = type;

    const pageNum = Math.max(1, parseInt(page || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit || '20')));
    const skip = (pageNum - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          fromLocation: true,
          toLocation: true,
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get(':id/stock')
  async getStock(@Param('id') id: string) {
    const stocks = await this.prisma.inventoryLocationStock.findMany({
      where: { locationId: id },
      include: {
        item: { include: { drug: true } },
      },
    });

    const drugs = stocks.filter(s => s.item.drug).map(s => ({
      drug: s.item.drug!,
      quantity: s.quantity,
    }));
    const items = stocks.filter(s => !s.item.drug).map(s => ({
      item: s.item,
      quantity: s.quantity,
    }));

    return { drugs, items };
  }
}