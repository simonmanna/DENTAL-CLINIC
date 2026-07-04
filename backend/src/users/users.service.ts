import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFilterDto } from './dto/user-filter.dto';

// Safe user type without password
export type SafeUser = Omit<User, 'password' | 'refreshToken'>;

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private prisma: PrismaService) {}

  // ─── Helper: Exclude sensitive fields ─────────────────────────────────────
  private excludeSensitiveFields(user: User): SafeUser {
    const { password, refreshToken, ...safeUser } = user;
    return safeUser;
  }

  // ─── Helper: Hash password ─────────────────────────────────────────────────
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  // ─── Helper: Verify password ───────────────────────────────────────────────
  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────
  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const { email, password, role, staffData } = createUserDto;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException(`User with email ${email} already exists`);
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user with optional staff profile
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role || UserRole.RECEPTIONIST,
        isActive: true,
        staff: staffData
          ? {
              create: {
                firstName: staffData.firstName,
                lastName: staffData.lastName,
                phone: staffData.phone,
                specialization: staffData.specialization,
                licenseNumber: staffData.licenseNumber,
                qualification: staffData.qualification,
                bio: staffData.bio,
                joiningDate: staffData.joiningDate || new Date(),
              },
            }
          : undefined,
      },
      include: {
        staff: true,
      },
    });

    return this.excludeSensitiveFields(user);
  }

  // ─── READ ALL (with filters & pagination) ──────────────────────────────────
  async findAll(filters: UserFilterDto): Promise<{ data: SafeUser[]; total: number; page: number; limit: number }> {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      isActive, 
      search,
      hasStaffProfile,
      orderBy = 'createdAt',
      order = 'desc'
    } = filters;

    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        {
          staff: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    if (hasStaffProfile !== undefined) {
      where.staff = hasStaffProfile ? { isNot: null } : { is: null };
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderBy]: order },
        include: {
          staff: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(user => this.excludeSensitiveFields(user)),
      total,
      page,
      limit,
    };
  }

  // ─── READ ONE ───────────────────────────────────────────────────────────────
  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        staff: {
          include: {
            schedules: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.excludeSensitiveFields(user);
  }

  // ─── READ ONE BY EMAIL (for auth) ───────────────────────────────────────────
  async findByEmail(email: string, includePassword = false): Promise<User | SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        staff: true,
      },
    });

    if (!user) return null;

    if (includePassword) {
      return user; // Return full user with password for auth verification
    }

    return this.excludeSensitiveFields(user);
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────
  async update(id: string, updateUserDto: UpdateUserDto): Promise<SafeUser> {
    const { password, role, isActive, staffData, ...rest } = updateUserDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      include: { staff: true },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Build update data
    const updateData: Prisma.UserUpdateInput = { ...rest };

    // Handle password update
    if (password) {
      updateData.password = await this.hashPassword(password);
    }

    // Handle role update
    if (role) {
      updateData.role = role;
    }

    // Handle isActive update
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    // Handle staff profile update
    if (staffData) {
      // Build staff update data - only include defined fields
      const staffUpdateData: Prisma.StaffUpdateInput = {};
      const staffCreateData: Prisma.StaffCreateWithoutUserInput = {
        firstName: '', // Will be overridden below
        lastName: '',  // Will be overridden below
      };

      // Only add fields that are provided
      if (staffData.firstName !== undefined) {
        staffUpdateData.firstName = staffData.firstName;
        staffCreateData.firstName = staffData.firstName;
      }
      if (staffData.lastName !== undefined) {
        staffUpdateData.lastName = staffData.lastName;
        staffCreateData.lastName = staffData.lastName;
      }
      if (staffData.phone !== undefined) staffUpdateData.phone = staffData.phone;
      if (staffData.specialization !== undefined) staffUpdateData.specialization = staffData.specialization;
      if (staffData.licenseNumber !== undefined) staffUpdateData.licenseNumber = staffData.licenseNumber;
      if (staffData.qualification !== undefined) staffUpdateData.qualification = staffData.qualification;
      if (staffData.bio !== undefined) staffUpdateData.bio = staffData.bio;
      if (staffData.isAvailable !== undefined) staffUpdateData.isAvailable = staffData.isAvailable;

      if (existingUser.staff) {
        // Update existing staff profile - only if there are fields to update
        if (Object.keys(staffUpdateData).length > 0) {
          updateData.staff = { update: staffUpdateData };
        }
      } else {
        // Create new staff profile - require firstName and lastName
        if (!staffData.firstName || !staffData.lastName) {
          throw new BadRequestException('firstName and lastName are required when creating a new staff profile');
        }
        staffCreateData.firstName = staffData.firstName;
        staffCreateData.lastName = staffData.lastName;
        if (staffData.phone !== undefined) staffCreateData.phone = staffData.phone;
        if (staffData.specialization !== undefined) staffCreateData.specialization = staffData.specialization;
        if (staffData.licenseNumber !== undefined) staffCreateData.licenseNumber = staffData.licenseNumber;
        if (staffData.qualification !== undefined) staffCreateData.qualification = staffData.qualification;
        if (staffData.bio !== undefined) staffCreateData.bio = staffData.bio;
        staffCreateData.joiningDate = new Date();
        
        updateData.staff = { create: staffCreateData };
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        staff: true,
      },
    });

    return this.excludeSensitiveFields(user);
  }

  // ─── DELETE (soft delete by deactivating) ────────────────────────────────────
  async remove(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Soft delete - deactivate user
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        refreshToken: null, // Clear refresh token
      },
      include: {
        staff: true,
      },
    });

    return this.excludeSensitiveFields(updatedUser);
  }

  // ─── HARD DELETE (use with caution) ──────────────────────────────────────────
  async hardDelete(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.prisma.user.delete({
      where: { id },
    });
  }

  // ─── UPDATE REFRESH TOKEN ──────────────────────────────────────────────────
  async updateRefreshToken(id: string, refreshToken: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { refreshToken },
    });
  }

  // ─── GET USER STATS ─────────────────────────────────────────────────────────
  async getStats(): Promise<{
    total: number;
    byRole: Record<string, number>;
    active: number;
    inactive: number;
    withStaffProfile: number;
  }> {
    const [
      total,
      byRole,
      active,
      inactive,
      withStaffProfile,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.user.count({ where: { staff: { isNot: null } } }),
    ]);

    const roleCounts: Record<string, number> = {};
    byRole.forEach((item) => {
      roleCounts[item.role] = item._count.id;
    });

    return {
      total,
      byRole: roleCounts,
      active,
      inactive,
      withStaffProfile,
    };
  }

  // ─── GET STAFF FOR DROPDOWN (for expenses, appointments, etc.) ─────────────
  async getStaffForDropdown(): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    role: UserRole;
  }[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        staff: { isNot: null },
      },
      include: {
        staff: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        staff: {
          lastName: 'asc',
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.staff?.firstName || null,
      lastName: user.staff?.lastName || null,
      fullName: user.staff
        ? `${user.staff.firstName || ''} ${user.staff.lastName || ''}`.trim()
        : user.email,
      role: user.role,
    }));
  }
}