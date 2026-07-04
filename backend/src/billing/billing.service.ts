// src/billing/billing.service.ts
//
// Maintains the Billing Service Catalogue (the menu of priced services the
// clinic offers). Invoice / payment lifecycle is owned by InvoicesService and
// InvoiceLifecycleService — do NOT add invoice or payment logic here.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateBillingServiceDto,
  UpdateBillingServiceDto,
  QueryBillingServiceDto,
} from './dto/billing-service.dto';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async findAllServices(query: QueryBillingServiceDto) {
    const where: Prisma.BillingServiceWhereInput = {};

    if (query.category && query.category !== 'ALL') {
      where.category = query.category as any;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    }

    if (query.isFavorite !== undefined) {
      where.isFavorite = query.isFavorite === 'true';
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { serviceCode: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const services = await this.prisma.billingService.findMany({
      where,
      orderBy: [{ isFavorite: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return services.map((s) => this.serializeBillingService(s));
  }

  async findServiceById(id: string) {
    const service = await this.prisma.billingService.findUnique({
      where: { id },
    });
    if (!service) {
      throw new NotFoundException('Billing service not found');
    }
    return this.serializeBillingService(service);
  }

  async findServiceByCode(serviceCode: string) {
    const service = await this.prisma.billingService.findUnique({
      where: { serviceCode },
    });
    return service ? this.serializeBillingService(service) : null;
  }

  async createService(data: CreateBillingServiceDto) {
    const existing = await this.prisma.billingService.findUnique({
      where: { serviceCode: data.serviceCode },
    });
    if (existing) {
      throw new BadRequestException(
        `Service code ${data.serviceCode} already exists`,
      );
    }

    const service = await this.prisma.billingService.create({
      data: {
        serviceCode: data.serviceCode,
        name: data.name,
        description: data.description,
        type: data.type,
        category: data.category,
        price: new Prisma.Decimal(data.price),
        currency: data.currency,
        exchangeRate: data.exchangeRate
          ? new Prisma.Decimal(data.exchangeRate)
          : null,
        defaultTaxAmount: new Prisma.Decimal(data.defaultTaxAmount || 0),
        defaultTaxLabel: data.defaultTaxLabel,
        priceRangeMin: data.priceRangeMin
          ? new Prisma.Decimal(data.priceRangeMin)
          : null,
        priceRangeMax: data.priceRangeMax
          ? new Prisma.Decimal(data.priceRangeMax)
          : null,
        isActive: data.isActive ?? true,
        isFavorite: data.isFavorite ?? false,
        sortOrder: data.sortOrder ?? 0,
        notes: data.notes,
      },
    });

    return this.serializeBillingService(service);
  }

  async updateService(id: string, data: UpdateBillingServiceDto) {
    const existing = await this.prisma.billingService.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Billing service not found');
    }

    if (data.serviceCode && data.serviceCode !== existing.serviceCode) {
      const duplicate = await this.prisma.billingService.findUnique({
        where: { serviceCode: data.serviceCode },
      });
      if (duplicate) {
        throw new BadRequestException(
          `Service code ${data.serviceCode} already exists`,
        );
      }
    }

    const service = await this.prisma.billingService.update({
      where: { id },
      data: {
        serviceCode: data.serviceCode,
        name: data.name,
        description: data.description,
        type: data.type,
        category: data.category,
        price: new Prisma.Decimal(data.price),
        currency: data.currency,
        exchangeRate: data.exchangeRate
          ? new Prisma.Decimal(data.exchangeRate)
          : null,
        defaultTaxAmount: new Prisma.Decimal(data.defaultTaxAmount || 0),
        defaultTaxLabel: data.defaultTaxLabel,
        priceRangeMin: data.priceRangeMin
          ? new Prisma.Decimal(data.priceRangeMin)
          : null,
        priceRangeMax: data.priceRangeMax
          ? new Prisma.Decimal(data.priceRangeMax)
          : null,
        isActive: data.isActive,
        isFavorite: data.isFavorite,
        sortOrder: data.sortOrder,
        notes: data.notes,
      },
    });

    return this.serializeBillingService(service);
  }

  async deleteService(id: string) {
    const existing = await this.prisma.billingService.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Billing service not found');
    }

    const service = await this.prisma.billingService.delete({
      where: { id },
    });

    return this.serializeBillingService(service);
  }

  async toggleServiceFavorite(id: string) {
    const service = await this.prisma.billingService.findUnique({
      where: { id },
    });
    if (!service) {
      throw new NotFoundException('Billing service not found');
    }

    const updated = await this.prisma.billingService.update({
      where: { id },
      data: { isFavorite: !service.isFavorite },
    });

    return this.serializeBillingService(updated);
  }

  private serializeBillingService(service: any) {
    return {
      ...service,
      price: service.price?.toNumber?.() ?? service.price,
      exchangeRate:
        service.exchangeRate?.toNumber?.() ?? service.exchangeRate ?? null,
      defaultTaxAmount:
        service.defaultTaxAmount?.toNumber?.() ?? service.defaultTaxAmount ?? 0,
      priceRangeMin:
        service.priceRangeMin?.toNumber?.() ?? service.priceRangeMin ?? null,
      priceRangeMax:
        service.priceRangeMax?.toNumber?.() ?? service.priceRangeMax ?? null,
    };
  }
}
