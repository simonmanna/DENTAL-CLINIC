// src/expense-categories/expense-categories.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-hardened expense-categories controller (post-audit).
//   • @Roles on every endpoint — RECEPTIONIST can read but cannot mutate.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ExpenseCategoriesService, Actor } from './expense-categories.service';
import {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { extractClientContext } from '../common/audit/client-context';

function actorOf(req: any): Actor {
  return {
    id: req?.user?.id ?? req?.user?.userId ?? null,
    email: req?.user?.email ?? null,
  };
}

@ApiTags('Expense Categories')
@ApiBearerAuth()
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly svc: ExpenseCategoriesService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.PHARMACIST,
  )
  @ApiOperation({ summary: 'List expense categories' })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.svc.list({
      includeInactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.PHARMACIST,
  )
  @ApiOperation({ summary: 'Get a single expense category' })
  getOne(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an expense category' })
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() dto: CreateExpenseCategoryDto) {
    const ctx = extractClientContext(req);
    return this.svc.create(dto, actorOf(req), ctx.ipAddress, ctx.userAgent);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit / disable an expense category' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.update(id, dto, actorOf(req), ctx.ipAddress, ctx.userAgent);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete an unused, non-system category' })
  @HttpCode(HttpStatus.OK)
  remove(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const ctx = extractClientContext(req);
    return this.svc.remove(id, actorOf(req), body?.reason, ctx.ipAddress, ctx.userAgent);
  }
}
