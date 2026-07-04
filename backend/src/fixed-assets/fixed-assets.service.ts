// src/fixed-assets/fixed-assets.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFixedAssetDto,
  UpdateFixedAssetDto,
  DisposeAssetDto,
  CreateMaintenanceDto,
  CompleteMaintenanceDto,
  TransferAssetDto,
  PostDepreciationDto,
  FixedAssetQueryDto,
  AssetStatus,
  AssetMovementType,
  MaintenanceStatus,
  DepreciationMethod,
} from './dto/fixed-assets.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class FixedAssetsService {
  constructor(private prisma: PrismaService) {}

  // ── Asset Code generator ────────────────────────────────────────────────────

  private categoryPrefix: Record<string, string> = {
    DENTAL_EQUIPMENT: 'DE',
    IMAGING_EQUIPMENT: 'IE',
    STERILIZATION: 'ST',
    LABORATORY: 'LB',
    OFFICE_EQUIPMENT: 'OE',
    FURNITURE: 'FN',
    VEHICLES: 'VH',
    BUILDING: 'BD',
    IT_INFRASTRUCTURE: 'IT',
    MEDICAL_INSTRUMENTS: 'MI',
    OTHER: 'OT',
  };

  private async generateAssetCode(category: string): Promise<string> {
    const prefix = this.categoryPrefix[category] ?? 'AS';
    const count = await this.prisma.fixedAsset.count({
      where: { category: category as any },
    });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  // ── ASSETS CRUD ─────────────────────────────────────────────────────────────

  async create(dto: CreateFixedAssetDto, createdById?: string) {
    const assetCode = await this.generateAssetCode(dto.category);

    // Calculate initial book value = purchase cost
    const purchaseCost = new Decimal(dto.purchaseCost);

    const asset = await this.prisma.fixedAsset.create({
      data: {
        assetCode,
        name: dto.name,
        description: dto.description,
        category: dto.category as any,
        condition: (dto.condition as any) ?? 'GOOD',
        purchaseDate: new Date(dto.purchaseDate),
        purchaseCost,
        currency: dto.currency ?? 'UGX',
        supplierId: dto.supplierId,
        invoiceNumber: dto.invoiceNumber,
        warrantyExpiry: dto.warrantyExpiry
          ? new Date(dto.warrantyExpiry)
          : undefined,
        serialNumber: dto.serialNumber,
        modelNumber: dto.modelNumber,
        manufacturer: dto.manufacturer,
        locationId: dto.locationId,
        assignedToStaffId: dto.assignedToStaffId,
        assignedAt: dto.assignedToStaffId ? new Date() : undefined,
        depreciationMethod: (dto.depreciationMethod as any) ?? 'STRAIGHT_LINE',
        usefulLifeYears: dto.usefulLifeYears,
        salvageValue:
          dto.salvageValue !== undefined
            ? new Decimal(dto.salvageValue)
            : undefined,
        depreciationRate:
          dto.depreciationRate !== undefined
            ? new Decimal(dto.depreciationRate)
            : undefined,
        depreciationStartDate: dto.depreciationStartDate
          ? new Date(dto.depreciationStartDate)
          : new Date(dto.purchaseDate),
        isDepreciable: dto.isDepreciable ?? true,
        currentBookValue: purchaseCost,
        accumulatedDepreciation: new Decimal(0),
        notes: dto.notes,
        tags: dto.tags ?? [],
        attachments: dto.attachments ?? [],
      },
      include: this.assetIncludes(),
    });

    // Log initial placement
    if (dto.locationId || dto.assignedToStaffId) {
      await this.prisma.assetMovement.create({
        data: {
          assetId: asset.id,
          type: 'INITIAL_PLACEMENT',
          toLocationId: dto.locationId,
          toStaffId: dto.assignedToStaffId,
          authorizedById: createdById,
        },
      });
    }

    await this.logAudit(
      asset.id,
      'CREATED',
      undefined,
      undefined,
      undefined,
      createdById,
    );
    return asset;
  }

  async findAll(query: FixedAssetQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { assetCode: { contains: query.search, mode: 'insensitive' } },
        { serialNumber: { contains: query.search, mode: 'insensitive' } },
        { manufacturer: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.condition) where.condition = query.condition;
    if (query.locationId) where.locationId = query.locationId;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.assignedToStaffId)
      where.assignedToStaffId = query.assignedToStaffId;

    if (query.warrantyExpiringSoon) {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      where.warrantyExpiry = { lte: thirtyDays, gte: new Date() };
    }

    if (query.maintenanceDueSoon) {
      const fourteenDays = new Date();
      fourteenDays.setDate(fourteenDays.getDate() + 14);
      where.maintenanceRecords = {
        some: {
          status: 'SCHEDULED',
          scheduledDate: { lte: fourteenDays },
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.fixedAsset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.assetIncludes(),
      }),
      this.prisma.fixedAsset.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id },
      include: {
        ...this.assetIncludes(),
        depreciationEntries: { orderBy: { periodStart: 'desc' }, take: 24 },
        maintenanceRecords: { orderBy: { scheduledDate: 'desc' } },
        movementHistory: { orderBy: { movedAt: 'desc' } },
        auditTrail: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!asset) throw new NotFoundException(`Asset not found`);
    return asset;
  }

  async update(id: string, dto: UpdateFixedAssetDto, updatedById?: string) {
    await this.findOne(id);

    const data: any = { ...dto };
    if (dto.purchaseCost !== undefined)
      data.purchaseCost = new Decimal(dto.purchaseCost);
    if (dto.salvageValue !== undefined)
      data.salvageValue = new Decimal(dto.salvageValue);
    if (dto.depreciationRate !== undefined)
      data.depreciationRate = new Decimal(dto.depreciationRate);
    if (dto.purchaseDate) data.purchaseDate = new Date(dto.purchaseDate);
    if (dto.warrantyExpiry) data.warrantyExpiry = new Date(dto.warrantyExpiry);
    if (dto.depreciationStartDate)
      data.depreciationStartDate = new Date(dto.depreciationStartDate);

    const updated = await this.prisma.fixedAsset.update({
      where: { id },
      data,
      include: this.assetIncludes(),
    });

    await this.logAudit(
      id,
      'UPDATED',
      undefined,
      undefined,
      undefined,
      updatedById,
    );
    return updated;
  }

  // ── Disposal ─────────────────────────────────────────────────────────────────

  async dispose(id: string, dto: DisposeAssetDto, userId?: string) {
    const asset = await this.findOne(id);
    if (asset.status === AssetStatus.DISPOSED) {
      throw new ConflictException('Asset is already disposed');
    }

    const updated = await this.prisma.fixedAsset.update({
      where: { id },
      data: {
        status: 'DISPOSED',
        disposedAt: new Date(dto.disposedAt),
        disposalMethod: dto.disposalMethod as any,
        disposalValue:
          dto.disposalValue !== undefined
            ? new Decimal(dto.disposalValue)
            : undefined,
        disposalNotes: dto.disposalNotes,
      },
      include: this.assetIncludes(),
    });

    await this.logAudit(
      id,
      'DISPOSED',
      'status',
      asset.status,
      'DISPOSED',
      userId,
    );
    return updated;
  }

  // ── Transfer ──────────────────────────────────────────────────────────────────

  async transfer(dto: TransferAssetDto, userId?: string) {
    const asset = await this.findOne(dto.assetId);
    if (asset.status === AssetStatus.DISPOSED) {
      throw new BadRequestException('Cannot transfer a disposed asset');
    }

    const movement = await this.prisma.assetMovement.create({
      data: {
        assetId: dto.assetId,
        type: (dto.type as any) ?? 'TRANSFER',
        fromLocationId: asset.locationId ?? undefined,
        toLocationId: dto.toLocationId,
        fromStaffId: asset.assignedToStaffId ?? undefined,
        toStaffId: dto.toStaffId,
        reason: dto.reason,
        expectedReturnDate: dto.expectedReturnDate
          ? new Date(dto.expectedReturnDate)
          : undefined,
        authorizedById: userId,
      },
    });

    await this.prisma.fixedAsset.update({
      where: { id: dto.assetId },
      data: {
        locationId: dto.toLocationId,
        assignedToStaffId: dto.toStaffId,
        assignedAt: dto.toStaffId ? new Date() : undefined,
      },
    });

    await this.logAudit(
      dto.assetId,
      'TRANSFERRED',
      undefined,
      undefined,
      undefined,
      userId,
    );
    return movement;
  }

  // ── Maintenance ────────────────────────────────────────────────────────────────

  async createMaintenance(dto: CreateMaintenanceDto, userId?: string) {
    await this.findOne(dto.assetId);

    const maintenanceCode = `MNT-${Date.now().toString(36).toUpperCase()}`;

    const maintenance = await this.prisma.assetMaintenance.create({
      data: {
        maintenanceCode,
        assetId: dto.assetId,
        type: dto.type as any,
        status: 'SCHEDULED',
        title: dto.title,
        description: dto.description,
        scheduledDate: new Date(dto.scheduledDate),
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined,
        estimatedCost:
          dto.estimatedCost !== undefined
            ? new Decimal(dto.estimatedCost)
            : undefined,
        serviceProvider: dto.serviceProvider,
        technicianName: dto.technicianName,
        performedById: userId,
      },
    });

    // Update asset status to UNDER_MAINTENANCE
    await this.prisma.fixedAsset.update({
      where: { id: dto.assetId },
      data: { status: 'UNDER_MAINTENANCE' },
    });

    await this.logAudit(
      dto.assetId,
      'MAINTENANCE_SCHEDULED',
      undefined,
      undefined,
      undefined,
      userId,
    );
    return maintenance;
  }

  async completeMaintenance(
    maintenanceId: string,
    dto: CompleteMaintenanceDto,
    userId?: string,
  ) {
    const record = await this.prisma.assetMaintenance.findUnique({
      where: { id: maintenanceId },
      include: { asset: true },
    });
    if (!record) throw new NotFoundException('Maintenance record not found');

    const updated = await this.prisma.assetMaintenance.update({
      where: { id: maintenanceId },
      data: {
        status: 'COMPLETED',
        completedDate: new Date(dto.completedDate),
        actualCost:
          dto.actualCost !== undefined
            ? new Decimal(dto.actualCost)
            : undefined,
        conditionBefore: record.asset.condition,
        conditionAfter: (dto.conditionAfter as any) ?? record.asset.condition,
        findings: dto.findings,
        partsReplaced: dto.partsReplaced,
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined,
        attachments: dto.attachments ?? [],
      },
    });

    // Restore asset status to ACTIVE (or IDLE if previously idle)
    await this.prisma.fixedAsset.update({
      where: { id: record.assetId },
      data: {
        status: 'ACTIVE',
        condition: (dto.conditionAfter as any) ?? record.asset.condition,
      },
    });

    await this.logAudit(
      record.assetId,
      'MAINTENANCE_COMPLETED',
      undefined,
      undefined,
      undefined,
      userId,
    );
    return updated;
  }

  // ── Depreciation ──────────────────────────────────────────────────────────────

  async postDepreciation(dto: PostDepreciationDto, userId?: string) {
    const where: any = {
      isDepreciable: true,
      status: { in: ['ACTIVE', 'IDLE', 'UNDER_MAINTENANCE'] },
      depreciationMethod: { not: 'NONE' },
    };

    if (dto.assetIds?.length) {
      where.id = { in: dto.assetIds };
    }

    const assets = await this.prisma.fixedAsset.findMany({ where });

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    const yearsInPeriod =
      (periodEnd.getTime() - periodStart.getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);

    const entries: any[] = [];

    for (const asset of assets) {
      const bookValue = new Decimal(asset.currentBookValue.toString());
      const salvage = asset.salvageValue
        ? new Decimal(asset.salvageValue.toString())
        : new Decimal(0);

      if (bookValue.lte(salvage)) continue; // Fully depreciated

      let depreciationAmount = new Decimal(0);

      if (
        asset.depreciationMethod === 'STRAIGHT_LINE' &&
        asset.usefulLifeYears
      ) {
        const purchaseCost = new Decimal(asset.purchaseCost.toString());
        const annualDep = purchaseCost
          .minus(salvage)
          .dividedBy(asset.usefulLifeYears);
        depreciationAmount = annualDep.times(yearsInPeriod);
      } else if (
        asset.depreciationMethod === 'DECLINING_BALANCE' &&
        asset.depreciationRate
      ) {
        const rate = new Decimal(asset.depreciationRate.toString());
        depreciationAmount = bookValue.times(rate).times(yearsInPeriod);
      }

      // Cap at remaining book value above salvage
      const maxDep = bookValue.minus(salvage);
      if (depreciationAmount.gt(maxDep)) depreciationAmount = maxDep;

      const newBookValue = bookValue.minus(depreciationAmount);
      const newAccumulated = new Decimal(
        asset.accumulatedDepreciation.toString(),
      ).plus(depreciationAmount);

      const [entry] = await Promise.all([
        this.prisma.assetDepreciationEntry.create({
          data: {
            assetId: asset.id,
            periodStart,
            periodEnd,
            depreciationAmount,
            bookValueBefore: bookValue,
            bookValueAfter: newBookValue,
            method: asset.depreciationMethod,
            notes: dto.notes,
            postedById: userId,
          },
        }),
        this.prisma.fixedAsset.update({
          where: { id: asset.id },
          data: {
            currentBookValue: newBookValue,
            accumulatedDepreciation: newAccumulated,
            lastDepreciationDate: periodEnd,
          },
        }),
      ]);

      entries.push(entry);
    }

    return { posted: entries.length, entries };
  }

  // ── Summary / Dashboard stats ─────────────────────────────────────────────────

  async getSummary() {
    const [
      total,
      active,
      underMaintenance,
      disposed,
      byCategory,
      totalCostAgg,
      totalBookValueAgg,
      warrantyExpiring,
      maintenanceDue,
    ] = await Promise.all([
      this.prisma.fixedAsset.count(),
      this.prisma.fixedAsset.count({ where: { status: 'ACTIVE' } }),
      this.prisma.fixedAsset.count({ where: { status: 'UNDER_MAINTENANCE' } }),
      this.prisma.fixedAsset.count({ where: { status: 'DISPOSED' } }),
      this.prisma.fixedAsset.groupBy({
        by: ['category'],
        _count: { id: true },
        _sum: { currentBookValue: true },
      }),
      this.prisma.fixedAsset.aggregate({
        _sum: { purchaseCost: true },
        where: { status: { not: 'DISPOSED' } },
      }),
      this.prisma.fixedAsset.aggregate({
        _sum: { currentBookValue: true },
        where: { status: { not: 'DISPOSED' } },
      }),
      this.prisma.fixedAsset.count({
        where: {
          warrantyExpiry: {
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            gte: new Date(),
          },
        },
      }),
      this.prisma.assetMaintenance.count({
        where: {
          status: { in: ['SCHEDULED', 'OVERDUE'] },
          scheduledDate: {
            lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const totalCost = totalCostAgg._sum.purchaseCost ?? new Decimal(0);
    const totalBookValue =
      totalBookValueAgg._sum.currentBookValue ?? new Decimal(0);
    const totalDepreciation = new Decimal(totalCost.toString()).minus(
      new Decimal(totalBookValue.toString()),
    );

    return {
      counts: {
        total,
        active,
        underMaintenance,
        disposed,
        idle: total - active - underMaintenance - disposed,
      },
      financials: {
        totalCost: totalCost.toFixed(2),
        totalBookValue: totalBookValue.toFixed(2),
        totalDepreciation: totalDepreciation.toFixed(2),
        depreciationPercent: totalCost.gt(0)
          ? totalDepreciation.dividedBy(totalCost).times(100).toFixed(1)
          : '0.0',
      },
      alerts: { warrantyExpiring, maintenanceDue },
      byCategory: byCategory.map((c) => ({
        category: c.category,
        count: c._count.id,
        bookValue: (c._sum.currentBookValue ?? new Decimal(0)).toFixed(2),
      })),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private assetIncludes() {
    return {
      supplier: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, type: true } },
      assignedToStaff: {
        select: { id: true, firstName: true, lastName: true },
      },
      maintenanceRecords: {
        where: {
          status: {
            in: [
              MaintenanceStatus.SCHEDULED,
              MaintenanceStatus.IN_PROGRESS,
              MaintenanceStatus.OVERDUE,
            ], // ✅ MaintenanceStatus[]
          },
        },
        orderBy: { scheduledDate: 'asc' as const },
        take: 3,
      },
    };
  }

  private async logAudit(
    assetId: string,
    action: string,
    fieldChanged?: string,
    oldValue?: any,
    newValue?: any,
    userId?: string,
  ) {
    await this.prisma.assetAuditTrail.create({
      data: {
        assetId,
        action,
        fieldChanged,
        oldValue: oldValue !== undefined ? String(oldValue) : undefined,
        newValue: newValue !== undefined ? String(newValue) : undefined,
        changedById: userId,
      },
    });
  }
}
