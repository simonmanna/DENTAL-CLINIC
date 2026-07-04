import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseBoolPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InventoryCategoryService } from './inventory-category.service';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto';
import { InventoryCategoryResponseDto } from './dto/inventory-category-response.dto';
import { UserRole } from '@prisma/client';

@ApiTags('inventory-categories')
@ApiBearerAuth()
@Controller('inventory-categories')
export class InventoryCategoryController {
  constructor(private readonly service: InventoryCategoryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new inventory category' })
  @ApiResponse({ status: 201, type: InventoryCategoryResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Category already exists' })
  async create(@Body() dto: CreateInventoryCategoryDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List inventory categories' })
  @ApiResponse({ status: 200, type: [InventoryCategoryResponseDto] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({
    name: 'parentId',
    required: false,
    type: String,
    description: 'Filter by parent (use "null" for root categories)',
  })
  @ApiQuery({
    name: 'includeChildren',
    required: false,
    type: Boolean,
    default: false,
  })
  @ApiQuery({
    name: 'includeItemCount',
    required: false,
    type: Boolean,
    default: true,
  })
  async findAll(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('parentId') parentId?: string,
    @Query('includeChildren', new DefaultValuePipe(false), ParseBoolPipe)
    includeChildren?: boolean,
    @Query('includeItemCount', new DefaultValuePipe(true), ParseBoolPipe)
    includeItemCount?: boolean,
  ) {
    // Handle string "null" from query params
    const parsedParentId = parentId === 'null' ? null : parentId;
    return this.service.findAll({
      search,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      parentId: parsedParentId,
      includeChildren,
      includeItemCount,
    });
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get hierarchical category tree' })
  @ApiResponse({ status: 200, type: [InventoryCategoryResponseDto] })
  @ApiQuery({
    name: 'parentId',
    required: false,
    type: String,
    description: 'Root ID or "null" for top-level',
  })
  async getTree(@Query('parentId') parentId?: string) {
    const parsedParentId = parentId === 'null' ? null : parentId;
    return this.service.getTree(parsedParentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiResponse({ status: 200, type: InventoryCategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findOne(
    @Param('id') id: string,
    @Query('includeChildren', new DefaultValuePipe(false), ParseBoolPipe)
    includeChildren?: boolean,
  ) {
    return this.service.findOne(id, includeChildren);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiResponse({ status: 200, type: InventoryCategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 409, description: 'Conflict' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a category (soft delete)' })
  @ApiResponse({ status: 200, description: 'Category deactivated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({
    status: 409,
    description: 'Cannot delete - has items or children',
  })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a deactivated category' })
  @ApiResponse({ status: 200, type: InventoryCategoryResponseDto })
  async restore(@Param('id') id: string) {
    return this.service.restore(id);
  }
}
