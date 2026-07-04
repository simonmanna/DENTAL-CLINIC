// src/billing-services/billing-services.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBillingServiceDto } from './dto/create-billing-service.dto';
//import { CreateBillingServiceDto } from './dto/create-billing-service.dto';
import { UpdateBillingServiceDto } from './dto/update-billing-service.dto';
import { Prisma, BillingService, BillingServiceCategory } from '@prisma/client';

@Injectable()
export class BillingServicesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateBillingServiceDto): Promise<BillingService> {
    // Check for duplicate service code
    const existing = await this.prisma.billingService.findUnique({
      where: { serviceCode: dto.serviceCode },
    });

    if (existing) {
      throw new ConflictException(
        `Service code ${dto.serviceCode} already exists`,
      );
    }

    // Validate price range if both provided
    if (
      dto.priceRangeMin &&
      dto.priceRangeMax &&
      dto.priceRangeMin > dto.priceRangeMax
    ) {
      throw new BadRequestException(
        'Price range min cannot be greater than max',
      );
    }

    return this.prisma.billingService.create({
      data: {
        ...dto,
        price: new Prisma.Decimal(dto.price),
        exchangeRate: dto.exchangeRate
          ? new Prisma.Decimal(dto.exchangeRate)
          : null,
        defaultTaxAmount: new Prisma.Decimal(dto.defaultTaxAmount || 0),
        priceRangeMin: dto.priceRangeMin
          ? new Prisma.Decimal(dto.priceRangeMin)
          : null,
        priceRangeMax: dto.priceRangeMax
          ? new Prisma.Decimal(dto.priceRangeMax)
          : null,
      },
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    search?: string;
    category?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ data: BillingService[]; total: number }> {
    const {
      skip = 0,
      take = 10,
      search,
      category,
      isActive,
      sortBy = 'sortOrder',
      sortOrder = 'asc',
    } = params;

    const where: Prisma.BillingServiceWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { serviceCode: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(category && { category: category as BillingServiceCategory }),
      ...(isActive !== undefined && { isActive }),
    };

    const [data, total] = await Promise.all([
      this.prisma.billingService.findMany({
        where,
        skip: Number(skip),
        take: Number(take),
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.billingService.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string): Promise<BillingService> {
    const service = await this.prisma.billingService.findUnique({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException(`Billing service with ID ${id} not found`);
    }

    return service;
  }

  async findByCode(serviceCode: string): Promise<BillingService> {
    const service = await this.prisma.billingService.findUnique({
      where: { serviceCode },
    });

    if (!service) {
      throw new NotFoundException(
        `Billing service with code ${serviceCode} not found`,
      );
    }

    return service;
  }

  async update(
    id: string,
    dto: UpdateBillingServiceDto,
  ): Promise<BillingService> {
    await this.findOne(id); // Ensure exists

    // Check service code uniqueness if updating
    if (dto.serviceCode) {
      const existing = await this.prisma.billingService.findFirst({
        where: {
          serviceCode: dto.serviceCode,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException(
          `Service code ${dto.serviceCode} already exists`,
        );
      }
    }

    const updateData: Prisma.BillingServiceUpdateInput = {
      ...dto,
      ...(dto.price !== undefined && { price: new Prisma.Decimal(dto.price) }),
      ...(dto.exchangeRate !== undefined && {
        exchangeRate: new Prisma.Decimal(dto.exchangeRate),
      }),
      ...(dto.defaultTaxAmount !== undefined && {
        defaultTaxAmount: new Prisma.Decimal(dto.defaultTaxAmount),
      }),
      ...(dto.priceRangeMin !== undefined && {
        priceRangeMin: new Prisma.Decimal(dto.priceRangeMin),
      }),
      ...(dto.priceRangeMax !== undefined && {
        priceRangeMax: new Prisma.Decimal(dto.priceRangeMax),
      }),
    };

    return this.prisma.billingService.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    // Soft delete by deactivating or check for dependencies before hard delete
    // Here we do hard delete but you might want to check for ledger entries first
    await this.prisma.billingService.delete({
      where: { id },
    });
  }

  async toggleFavorite(id: string): Promise<BillingService> {
    const service = await this.findOne(id);
    return this.prisma.billingService.update({
      where: { id },
      data: { isFavorite: !service.isFavorite },
    });
  }

  async duplicate(id: string): Promise<BillingService> {
    const service = await this.findOne(id);

    // Convert Prisma Decimal fields to plain numbers for the DTO
    const createData: CreateBillingServiceDto = {
      serviceCode: `${service.serviceCode}-COPY`,
      name: `${service.name} (Copy)`,
      description: service.description ?? undefined,
      type: service.type,
      category: service.category,
      price: service.price.toNumber(),
      currency: service.currency,
      exchangeRate: service.exchangeRate?.toNumber(),
      defaultTaxAmount: service.defaultTaxAmount.toNumber(),
      defaultTaxLabel: service.defaultTaxLabel ?? undefined,
      priceRangeMin: service.priceRangeMin?.toNumber(),
      priceRangeMax: service.priceRangeMax?.toNumber(),
      isActive: service.isActive,
      isFavorite: false, // Reset favorite for copy
      sortOrder: service.sortOrder,
      notes: service.notes ?? undefined,
    };

    return this.create(createData);
  }
  //   async duplicate(id: string): Promise<BillingService> {
  //     const service = await this.findOne(id);
  //     const { id: _, serviceCode, createdAt, updatedAt, ...rest } = service;

  //     return this.create({
  //       ...rest,
  //       serviceCode: `${serviceCode}-COPY`,
  //       name: `${rest.name} (Copy)`,
  //     } as CreateBillingServiceDto);
  //   }
}
