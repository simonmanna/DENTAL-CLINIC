import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProcedureCategoriesService } from './procedure-categories.service';
import {
  CreateProcedureCategoryDto,
  UpdateProcedureCategoryDto,
  CategoryQueryDto,
} from './dto/procedure-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('procedure-categories')
@UseGuards(JwtAuthGuard)
export class ProcedureCategoriesController {
  constructor(private readonly categoriesService: ProcedureCategoriesService) {}

  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get('hierarchy')
  getHierarchy() {
    return this.categoriesService.findHierarchy();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: CreateProcedureCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Post('reorder')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reorder(
    @Body() categories: { id: string; sortOrder: number; parentId?: string | null }[],
  ) {
    return this.categoriesService.reorder(categories);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateProcedureCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}