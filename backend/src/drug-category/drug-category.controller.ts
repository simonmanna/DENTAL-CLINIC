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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DrugCategoriesService } from './drug-categories.service';
import { CreateDrugCategoryDto } from './dto/create-drug-category.dto';
import { UpdateDrugCategoryDto } from './dto/update-drug-category.dto';
import { QueryDrugCategoryDto } from './dto/query-drug-category.dto';

@ApiTags('Drug Categories')
@ApiBearerAuth()
@Controller('drug-categories')
export class DrugCategoriesController {
  constructor(private readonly drugCategoriesService: DrugCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new drug category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  create(@Body() dto: CreateDrugCategoryDto) {
    return this.drugCategoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all drug categories' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'parentId', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(@Query() query: QueryDrugCategoryDto) {
    return this.drugCategoriesService.findAll(query);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get category hierarchy tree' })
  getTree() {
    return this.drugCategoriesService.getTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single drug category with drugs' })
  @ApiParam({ name: 'id', description: 'Category ID (cuid)' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findOne(@Param('id') id: string) {
    return this.drugCategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a drug category' })
  @ApiParam({ name: 'id', description: 'Category ID (cuid)' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  update(@Param('id') id: string, @Body() dto: UpdateDrugCategoryDto) {
    return this.drugCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Delete a drug category',
    description: 'Only allowed if no drugs or sub-categories are linked.'
  })
  @ApiParam({ name: 'id', description: 'Category ID (cuid)' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 409, description: 'Category has linked drugs or children' })
  remove(@Param('id') id: string) {
    return this.drugCategoriesService.remove(id);
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Toggle category active status' })
  @ApiParam({ name: 'id', description: 'Category ID (cuid)' })
  toggleActive(@Param('id') id: string) {
    return this.drugCategoriesService.toggleActive(id);
  }
}