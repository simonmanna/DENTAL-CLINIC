// src/pharmacy/pharmacy.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionStatus, StockLedgerType, Prisma } from '@prisma/client';
import { StockMovementService } from '../common/inventory/stock-movement.service';
import { PrescriptionStockService } from '../common/inventory/prescription-stock.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────
export class CreateDrugDto {
  name: string;
  genericName?: string;
  categoryId?: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
  unit?: string;
  unitPrice?: number;
  sellPrice?: number;
  minStock?: number;
  requiresPrescription?: boolean;
  sideEffects?: string;
  contraindications?: string;
  inventoryItemId?: string;
}

export class CreatePrescriptionDto {
  patientId: string;
  dentistId: string;
  visitId: string;
  notes?: string;
  validUntil?: string;
  items: Array<{
    drugId: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
    route?: string;
    instructions?: string;
  }>;
}

export class DrugStockDto {
  type: 'PURCHASE' | 'USAGE' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  unitCost?: number;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
  reference?: string;
  performedBy?: string;
}

@Injectable()
export class PharmacyService {
  constructor(
    private prisma: PrismaService,
    private readonly movements?: StockMovementService,
    private readonly prescriptionStock?: PrescriptionStockService,
  ) {}

  /** Injected in the app; built on demand in unit specs. */
  private stock(): StockMovementService {
    return this.movements ?? new StockMovementService(new DocumentNumberService(this.prisma));
  }

  private rxStock(): PrescriptionStockService {
    return this.prescriptionStock ?? new PrescriptionStockService(this.stock());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRUGS - Linked to InventoryItem
  // ═══════════════════════════════════════════════════════════════════════════

  async createDrug(dto: CreateDrugDto) {
    const { inventoryItemId, categoryId, ...drugData } = dto;

    const data: Prisma.DrugCreateInput = {
      ...drugData,
      unit: dto.unit || 'tablet',
    };

    if (inventoryItemId) {
      data.inventoryItem = { connect: { id: inventoryItemId } };
    }

    if (categoryId) {
      data.category = { connect: { id: categoryId } };
    }

    return this.prisma.drug.create({ data });
  }

  async getDrugs(
    search?: string,
    categoryId?: string,
    lowStock?: boolean,
    locationId?: string,
  ) {
    const drugs = await this.prisma.drug.findMany({
      where: {
        isActive: true,
        ...(categoryId && { categoryId }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { genericName: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        inventoryItem: {
          select: {
            id: true,
            minQuantity: true,
            unitCost: true, // ✅ For dashboard/value calculations
            locationStocks: {
              where: locationId ? { locationId } : undefined,
              select: {
                id: true, // ✅ For potential updates
                locationId: true, // ✅ For JS filtering
                quantity: true, // ✅ For stock calculations
              },
            },
          },
        },
        category: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });

    if (lowStock) {
      return drugs.filter((d) => {
        if (!d.inventoryItem) return false;
        const totalQty = d.inventoryItem.locationStocks.reduce(
          (sum, s) => sum + s.quantity,
          0,
        );
        return totalQty <= (d.inventoryItem.minQuantity || 0);
      });
    }

    return drugs;
  }

  // async getDrugs(
  //   search?: string,
  //   categoryId?: string,
  //   lowStock?: boolean,
  //   locationId?: string,
  // ) {
  //   // ✅ Include locationStocks instead of quantity
  //   const drugs = await this.prisma.drug.findMany({
  //     where: {
  //       isActive: true,
  //       ...(categoryId && { categoryId }),
  //       ...(search && {
  //         OR: [
  //           { name: { contains: search, mode: 'insensitive' } },
  //           { genericName: { contains: search, mode: 'insensitive' } },
  //         ],
  //       }),
  //     },
  //     include: {
  //       inventoryItem: {
  //         select: {
  //           id: true,
  //           // ❌ REMOVED: quantity: true,
  //           minQuantity: true,
  //           unitCost: true,
  //           // ✅ ADD locationStocks for aggregation
  //           locationStocks: locationId
  //             ? { where: { locationId }, select: { quantity: true } }
  //             : { select: { quantity: true } },
  //         },
  //       },
  //       category: {
  //         select: { id: true, name: true, code: true },
  //       },
  //     },
  //     orderBy: { name: 'asc' },
  //   });

  //   if (lowStock) {
  //     return drugs.filter((d) => {
  //       if (!d.inventoryItem) return false;

  //       // ✅ Aggregate quantity from locationStocks
  //       const totalQty = d.inventoryItem.locationStocks.reduce(
  //         (sum, s) => sum + s.quantity,
  //         0,
  //       );

  //       return totalQty <= (d.inventoryItem.minQuantity || 0);
  //     });
  //   }

  //   return drugs;
  // }

  async getLowStockDrugs(locationId?: string) {
    const drugs = await this.prisma.drug.findMany({
      where: { isActive: true },
      include: {
        inventoryItem: {
          select: {
            // ✅ Include all fields you'll need later
            id: true,
            minQuantity: true,
            unitCost: true, // ✅ Add this!
            locationStocks: locationId
              ? {
                  where: { locationId },
                  select: { quantity: true, locationId: true },
                }
              : { select: { quantity: true, locationId: true } }, // ✅ Add locationId here too
          },
        },
      },
    });
    return drugs.filter((d) => {
      if (!d.inventoryItem) return false;

      // ✅ Aggregate from locationStocks
      const totalQty = d.inventoryItem.locationStocks.reduce(
        (sum, s) => sum + s.quantity,
        0,
      );

      return totalQty <= (d.inventoryItem.minQuantity || 0);
    });
  }

  async updateDrug(id: string, dto: Partial<CreateDrugDto>) {
    const { inventoryItemId, categoryId, ...updateData } = dto;

    const data: Prisma.DrugUpdateInput = { ...updateData };

    if (inventoryItemId !== undefined) {
      data.inventoryItem = { connect: { id: inventoryItemId } };
    }

    if (categoryId !== undefined) {
      data.category = { connect: { id: categoryId } };
    }

    return this.prisma.drug.update({ where: { id }, data });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STOCK ADJUSTMENT - Using InventoryLedger ✅
  // ═══════════════════════════════════════════════════════════════════════════

  async adjustStock(drugId: string, dto: DrugStockDto, locationId?: string) {
    const drug = await this.prisma.drug.findUnique({
      where: { id: drugId },
      include: { inventoryItem: true },
    });

    if (!drug) throw new NotFoundException('Drug not found');
    if (!drug.inventoryItem)
      throw new BadRequestException('Drug is not linked to inventory');
    if (!(dto.quantity > 0))
      throw new BadRequestException('Quantity must be greater than zero');

    const item = drug.inventoryItem;
    // The controller never passed a location, so this used to be a silent
    // no-op; and with one it wrote the location total only, never a batch.
    const effectiveLocationId =
      locationId ?? (await this.resolvePharmacyLocation());
    const isIn = dto.type === 'PURCHASE' || dto.type === 'RETURN';
    const type: StockLedgerType = {
      PURCHASE: StockLedgerType.PURCHASE_RECEIPT,
      USAGE: StockLedgerType.USAGE,
      ADJUSTMENT: isIn ? StockLedgerType.ADJUSTMENT_IN : StockLedgerType.ADJUSTMENT_OUT,
      RETURN: StockLedgerType.RETURN_IN,
    }[dto.type];
    const notes =
      (dto.notes ?? `Stock ${dto.type.toLowerCase()}: ${dto.reference ?? ''}`) +
      (dto.performedBy ? ` | By: ${dto.performedBy}` : '');

    await this.prisma.$transaction(async (tx) => {
      if (isIn) {
        await this.stock().receive(tx, {
          itemId: item.id,
          locationId: effectiveLocationId,
          quantity: dto.quantity,
          unitCost: dto.unitCost ?? toNum(item.unitCost),
          batchNumber: dto.batchNumber ?? null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          type,
          referenceType: 'DRUG_ADJUSTMENT',
          referenceId: drugId,
          notes,
          requireBatchDetails: false,
          preserveBatchNumber: item.batchTracking,
          itemName: drug.name,
        });
      } else {
        await this.stock().issue(tx, {
          itemId: item.id,
          locationId: effectiveLocationId,
          quantity: dto.quantity,
          strategy: dto.batchNumber ? 'MANUAL' : 'FEFO',
          selectedBatchNumber: dto.batchNumber ?? null,
          // A downward correction may be expired stock thrown away.
          allowExpired: dto.type === 'ADJUSTMENT',
          type,
          referenceType: 'DRUG_ADJUSTMENT',
          referenceId: drugId,
          notes,
          itemName: drug.name,
        });
      }
    });

    return this.prisma.drug.findUnique({
      where: { id: drugId },
      include: {
        inventoryItem: {
          select: {
            id: true,
            unitCost: true,
            minQuantity: true,
            locationStocks: { select: { quantity: true, locationId: true } },
          },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRESCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async createPrescription(dto: CreatePrescriptionDto) {
    const code = `RX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return this.prisma.prescription.create({
      data: {
        prescriptionCode: code,
        patientId: dto.patientId,
        dentistId: dto.dentistId,
        visitId: dto.visitId,
        notes: dto.notes,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        items: {
          create: dto.items.map((item) => ({
            ...item,
            refills: 0, // Default value
          })),
        },
      },
      include: {
        items: { include: { drug: true } },
        patient: {
          select: { firstName: true, lastName: true, patientCode: true },
        },
        dentist: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async getPrescriptions(
    patientId?: string,
    status?: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(patientId && { patientId }),
      ...(status && { status: status as PrescriptionStatus }),
    };
    const [total, records] = await Promise.all([
      this.prisma.prescription.count({ where }),
      this.prisma.prescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: { include: { drug: true } },
          patient: {
            select: { firstName: true, lastName: true, patientCode: true },
          },
          dentist: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    return { data: records, meta: { total, page, limit } };
  }

  async dispensePrescription(
    id: string,
    dispensedBy: string,
    locationId?: string,
  ) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id },
      select: {
        id: true,
        prescriptionCode: true,
        status: true,
        items: { select: { id: true, quantity: true } },
      },
    });

    if (!rx) throw new NotFoundException('Prescription not found');
    if (rx.status !== PrescriptionStatus.ACTIVE)
      throw new BadRequestException('Prescription is not active');

    const effectiveLocationId =
      locationId ?? (await this.resolvePharmacyLocation());

    // One transaction for the whole prescription (it used to commit line by
    // line, so a shortfall on line 2 left line 1 deducted), and each line
    // leaves stock once — not again if its posted invoice already issued it.
    return this.prisma.$transaction(async (tx) => {
      for (const item of rx.items) {
        await this.rxStock().issueOnce(tx, {
          prescriptionItemId: item.id,
          quantity: item.quantity,
          locationId: effectiveLocationId,
          notes: `Dispensed for prescription ${rx.prescriptionCode}`,
        });
      }

      const claimed = await tx.prescription.updateMany({
        where: { id, status: PrescriptionStatus.ACTIVE },
        data: {
          status: PrescriptionStatus.DISPENSED,
          dispensedAt: new Date(),
          dispensedBy,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'This prescription was dispensed or changed in the meantime.',
        );
      }
      return tx.prescription.findUnique({ where: { id } });
    });
  }

  // Helper: Resolve pharmacy location (same pattern as pharmacy-sales.service)
  private async resolvePharmacyLocation(): Promise<string> {
    const setting = await this.prisma.clinicSettings.findUnique({
      where: { key: 'PHARMACY_LOCATION' },
    });

    if (setting?.value) {
      const loc = await this.prisma.location.findUnique({
        where: { id: setting.value },
        select: { id: true, isActive: true },
      });
      if (loc?.isActive) return loc.id;
    }

    const defaultLoc = await this.prisma.location.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });

    if (!defaultLoc) {
      throw new BadRequestException('No pharmacy location configured');
    }
    return defaultLoc.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES & LEDGER QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async getDrugCategories() {
    const result = await this.prisma.drug.groupBy({
      by: ['categoryId'],
      _count: true,
    });

    const categoryIds = result
      .map((r) => r.categoryId)
      .filter((id): id is string => id !== null);
    const categories = await this.prisma.drugCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, code: true },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return result.map((r) => ({
      categoryId: r.categoryId,
      category: r.categoryId ? categoryMap.get(r.categoryId) : null,
      count: r._count,
    }));
  }

  // ✅ FIXED: Query InventoryLedger instead of stockLog
  async getStockTransactions(drugId: string, locationId?: string) {
    const drug = await this.prisma.drug.findUnique({
      where: { id: drugId },
      include: { inventoryItem: true },
    });

    if (!drug?.inventoryItem) return [];

    return this.prisma.inventoryLedger.findMany({
      where: {
        itemId: drug.inventoryItem.id,
        ...(locationId && { locationId }),
        // Filter to pharmacy-relevant transaction types
        type: {
          in: [
            StockLedgerType.SALE,
            StockLedgerType.USAGE,
            StockLedgerType.RETURN_IN,
            StockLedgerType.PURCHASE_RECEIPT,
            StockLedgerType.ADJUSTMENT_IN,
            StockLedgerType.ADJUSTMENT_OUT,
            StockLedgerType.WASTE,
          ],
        },
      },
      include: {
        item: { select: { id: true, name: true, itemCode: true, unit: true } },
        location: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        performedBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ✅ BONUS: Get ledger entries for a specific prescription
  async getPrescriptionLedgerEntries(prescriptionId: string) {
    return this.prisma.inventoryLedger.findMany({
      where: {
        referenceType: 'PRESCRIPTION_DISPENSE',
        referenceId: prescriptionId,
      },
      include: {
        item: { select: { id: true, name: true, itemCode: true } },
        location: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        performedBy: { select: { id: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  async getDashboard(locationId?: string) {
    const [lowStock, todaySales, pendingPrescriptions] = await Promise.all([
      this.getLowStockDrugs(locationId),
      this.prisma.pharmacySale.count({
        where: {
          ...(locationId && { locationId }),
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          status: { not: 'CANCELLED' },
        },
      }),
      this.prisma.prescription.count({
        where: { status: 'ACTIVE' },
      }),
    ]);

    return {
      lowStockDrugs: lowStock.length,
      lowStockDetails: lowStock.map((d) => ({
        id: d.id,
        name: d.name,
        totalQuantity:
          d.inventoryItem?.locationStocks?.reduce(
            (sum, s) => sum + s.quantity,
            0,
          ) ?? 0,
        minQuantity: d.inventoryItem?.minQuantity ?? 0,
        // ✅ unitCost must be selected in the original query to be available here
        unitCost: d.inventoryItem?.unitCost ?? 0, // ✅ Now works if selected
      })),
      todaySalesCount: todaySales,
      pendingPrescriptions,
    };
  }
}
