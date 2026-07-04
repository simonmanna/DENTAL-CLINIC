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
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationResponseDto } from './dto/location-response.dto';
import { LocationTreeDto } from './dto/location-tree.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

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
}