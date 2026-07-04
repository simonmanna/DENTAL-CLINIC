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
  ParseIntPipe,
  DefaultValuePipe,
  ParseEnumPipe,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UsersService, SafeUser } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────
  @Post()
  @ApiOperation({ summary: 'Create a new user', description: 'Creates a user with optional staff profile' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(@Body(ValidationPipe) createUserDto: CreateUserDto): Promise<SafeUser> {
    return this.usersService.create(createUserDto);
  }

  // ─── READ ALL ───────────────────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'List all users', description: 'Get paginated list with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole, description: 'Filter by role' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search email or staff name' })
  @ApiQuery({ name: 'hasStaffProfile', required: false, type: Boolean, description: 'Filter by staff profile existence' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('role', new ParseEnumPipe(UserRole, { optional: true })) role?: UserRole,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('hasStaffProfile') hasStaffProfile?: string,
  ): Promise<{ data: SafeUser[]; total: number; page: number; limit: number }> {
    const filters: UserFilterDto = {
      page,
      limit,
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
      hasStaffProfile: hasStaffProfile !== undefined ? hasStaffProfile === 'true' : undefined,
    };
    return this.usersService.findAll(filters);
  }

  // ─── READ ONE ───────────────────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID', description: 'Includes staff profile and schedules' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<SafeUser> {
    return this.usersService.findOne(id);
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────
  @Patch(':id')
  @ApiOperation({ summary: 'Update user', description: 'Update user details, password, or staff profile' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
  ): Promise<SafeUser> {
    return this.usersService.update(id, updateUserDto);
  }

  // ─── SOFT DELETE (DEACTIVATE) ─────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user', description: 'Soft delete - sets isActive to false' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(@Param('id') id: string): Promise<SafeUser> {
    return this.usersService.remove(id);
  }

  // ─── HARD DELETE ────────────────────────────────────────────────────────────
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete user', description: 'Use with caution - irreversible' })
  @ApiResponse({ status: 204, description: 'User permanently deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async hardDelete(@Param('id') id: string): Promise<void> {
    return this.usersService.hardDelete(id);
  }

  // ─── GET STATS ──────────────────────────────────────────────────────────────
  @Get('stats/overview')
  @ApiOperation({ summary: 'Get user statistics', description: 'Counts by role, status, etc.' })
  async getStats(): Promise<{
    total: number;
    byRole: Record<string, number>;
    active: number;
    inactive: number;
    withStaffProfile: number;
  }> {
    return this.usersService.getStats();
  }

  // ─── GET STAFF DROPDOWN ─────────────────────────────────────────────────────
  @Get('staff/dropdown')
  @ApiOperation({ 
    summary: 'Get staff for dropdown', 
    description: 'Simplified list for selection in forms (expenses, appointments, etc.)' 
  })
  async getStaffForDropdown(): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    role: UserRole;
  }[]> {
    return this.usersService.getStaffForDropdown();
  }
}