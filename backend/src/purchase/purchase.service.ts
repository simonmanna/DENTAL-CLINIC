// src/purchase/purchase.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  PurchaseOrderStatus,
  StockLedgerType,
  UnitOfMeasure,
  DeliveryStatus,
  PaymentType,
  CashFlowDirection,
} from '@prisma/client';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ApprovePurchaseOrderDto,
  CreateDeliveryDto,
  CreatePurchasePaymentDto,
  CreateStockAdjustmentDto,
  CreateWasteRecordDto,
  PurchaseOrderQueryDto,
  InventoryLedgerQueryDto,
  CreateDeliveryItemDto,
} from './dto/purchase.dto';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { PaymentsService } from '../payments/payments.service';


import Decimal from 'decimal.js';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function genCode(prefix: string) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${timestamp}${random}`;
}

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
const DELIVERY_CONFIG = {
  EPSILON: new Decimal('0.0001'),
  MAX_OVER_DELIVERY_PCT: new Decimal('0.05'),
  DECIMAL_PLACES: 4,
};

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly docNum: DocumentNumberService,
  ) {}

  // ─────────────────────────────────────────────
  // UOM HELPERS
  // ─────────────────────────────────────────────

  getUOMDisplay(uom: UnitOfMeasure): string {
    const map: Record<UnitOfMeasure, string> = {
      PIECES: 'pcs',
      BOX: 'box',
      PACK: 'pack',
      BOTTLE: 'bottle',
      VIAL: 'vial',
      AMPULE: 'amp',
      TABLET: 'tab',
      CAPSULE: 'cap',
      STRIP: 'strip',
      TUBE: 'tube',
      SYRINGE: 'syringe',
      GLOVES_PAIR: 'pair',
      ROLL: 'roll',
      ML: 'ml',
      LITER: 'l',
      MG: 'mg',
      G: 'g',
      KG: 'kg',
      INCH: 'in',
      MM: 'mm',
      SET: 'set',
      KIT: 'kit',
    };
    return map[uom] || uom;
  }

  // ─────────────────────────────────────────────
  // HELPER: Aggregate quantity from location stocks
  // ─────────────────────────────────────────────
  private async aggregateItemQuantity(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId?: string,
  ): Promise<number> {
    const where: Prisma.InventoryLocationStockWhereInput = { itemId };
    if (locationId) where.locationId = locationId;

    const stocks = await tx.inventoryLocationStock.findMany({
      where,
      select: { quantity: true },
    });

    return stocks.reduce((sum, s) => sum + s.quantity, 0);
  }

  // ─────────────────────────────────────────────
  // PURCHASE ORDERS
  // ─────────────────────────────────────────────

  async createPurchaseOrder(dto: CreatePurchaseOrderDto, userId: string) {
    const sanitizedItems = dto.items.map((item) => ({
      ...item,
      quantityOrdered: Number(item.quantityOrdered),
      unitCost: Number(item.unitCost),
      taxPercent: Number(item.taxPercent || 0),
      discount: Number(item.discount || 0),
    }));

    const subtotal = sanitizedItems.reduce((sum, item) => {
      const lineTotal = item.quantityOrdered * item.unitCost;
      const lineTax = lineTotal * (item.taxPercent / 100);
      return sum + lineTotal + lineTax - item.discount;
    }, 0);

    const taxPercent = Number(dto.taxPercent || 0);
    const taxAmount = subtotal * (taxPercent / 100);
    const discountAmount = Number(dto.discountAmount || 0);
    const shippingCost = Number(dto.shippingCost || 0);
    const total = subtotal + taxAmount - discountAmount + shippingCost;

    return this.prisma.$transaction(async (tx) => {
      // Atomic document number — row-locks the (PO, year) counter inside this
      // transaction so two parallel creates cannot collide.
      const poNumber = await this.docNum.next('PO', tx);

      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          paymentTerms: dto.paymentTerms,
          expectedDate: dto.expectedDate
            ? new Date(dto.expectedDate)
            : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes,
          internalNotes: dto.internalNotes,
          status: dto.status || 'DRAFT',
          taxPercent,
          taxAmount,
          discountAmount,
          shippingCost,
          subtotal,
          total,
          balance: total,
          paymentStatus: 'UNPAID',
          supplierId: dto.supplierId,
          locationId: dto.locationId,
          createdById: userId,
        },
      });

      if (sanitizedItems.length > 0) {
        await tx.purchaseOrderItem.createMany({
          data: sanitizedItems.map((item) => {
            const itemSubtotal = item.quantityOrdered * item.unitCost;
            const itemTax = itemSubtotal * (item.taxPercent / 100);
            const itemTotal = itemSubtotal + itemTax - item.discount;
            return {
              purchaseOrderId: po.id,
              itemName: item.itemName,
              unit: item.unit,
              uom: item.uom || 'PIECES',
              quantityOrdered: item.quantityOrdered,
              quantityReceived: 0,
              unitCost: item.unitCost,
              taxPercent: item.taxPercent,
              discount: item.discount,
              total: itemTotal,
              batchNumber: item.batchNumber || null,
              expiryDate: item.expiryDate
                ? new Date(item.expiryDate)
                : undefined,
              notes: item.notes || null,
              inventoryItemId: item.inventoryItemId || null,
            };
          }),
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id: po.id },
        include: {
          items: {
            include: {
              inventoryItem: {
                select: { id: true, name: true, unit: true, uom: true },
              },
            },
          },
          supplier: true,
          location: true,
        },
      });
    });
  }

  async getPurchaseOrders(query: PurchaseOrderQueryDto) {
    const {
      supplierId,
      status,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 15,
    } = query;

    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.PurchaseOrderWhereInput = {
      ...(supplierId && { supplierId }),
      ...(status && { status: status as PurchaseOrderStatus }),
      ...(dateFrom || dateTo
        ? {
          createdAt: {
            gte: dateFrom ? new Date(dateFrom) : undefined,
            lte: dateTo ? new Date(dateTo) : undefined,
          },
        }
        : {}),
      ...(search
        ? {
          OR: [
            { poNumber: { contains: search, mode: 'insensitive' } },
            { supplier: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
            select: { id: true, name: true, phone: true, email: true },
          },
          location: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              itemName: true,
              uom: true,
              quantityOrdered: true,
              quantityReceived: true,
              unitCost: true,
              total: true,
              inventoryItem: {
                select: {
                  batchTracking: true,
                },
              },
              // batchTracking: true,
            },
          },
          _count: { select: { deliveries: true, payments: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);
    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    };
  }

  async getPurchaseOrder(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        location: true,
        items: {
          include: {
            inventoryItem: {
              select: {
                id: true,
                name: true,
                unit: true,
                uom: true,
                batchTracking: true,
              },
            },
          },
        },
        deliveries: {
          include: {
            items: true,
            location: { select: { id: true, name: true } },
          },
        },
        payments: true,
      },
    });

    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async updatePurchaseOrder(id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT orders can be edited');
    }

    const { items, ...updateData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });

        const subtotal = items.reduce((sum, item) => {
          const lineTotal = item.quantityOrdered * item.unitCost;
          const lineTax = lineTotal * ((item.taxPercent ?? 0) / 100);
          return sum + lineTotal + lineTax - (item.discount ?? 0);
        }, 0);

        const taxPercent = toNum(updateData.taxPercent ?? po.taxPercent);
        const taxAmount = subtotal * (taxPercent / 100);
        const discountAmount = toNum(updateData.discountAmount ?? po.discountAmount);
        const shippingCost = toNum(updateData.shippingCost ?? po.shippingCost);
        const total = subtotal + taxAmount - discountAmount + shippingCost;

        await tx.purchaseOrderItem.createMany({
          data: items.map((item) => {
            const itemSubtotal = item.quantityOrdered * item.unitCost;
            const itemTax = itemSubtotal * ((item.taxPercent ?? 0) / 100);
            const itemTotal = itemSubtotal + itemTax - (item.discount ?? 0);
            return {
              purchaseOrderId: id,
              itemName: item.itemName,
              unit: item.unit,
              uom: item.uom || 'PIECES',
              quantityOrdered: item.quantityOrdered,
              quantityReceived: 0,
              unitCost: item.unitCost,
              taxPercent: item.taxPercent ?? 0,
              discount: item.discount ?? 0,
              total: itemTotal,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate
                ? new Date(item.expiryDate)
                : undefined,
              notes: item.notes,
              inventoryItemId: item.inventoryItemId || null,
            };
          }),
        });

        return tx.purchaseOrder.update({
          where: { id },
          data: {
            ...updateData,
            subtotal,
            taxAmount,
            total,
            balance: total - toNum(po.amountPaid),
            updatedAt: new Date(),
          },
          include: {
            items: {
              include: {
                inventoryItem: { select: { id: true, name: true, unit: true } },
              },
            },
            supplier: true,
            location: true,
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: { ...updateData, updatedAt: new Date() },
        include: {
          items: {
            include: {
              inventoryItem: { select: { id: true, name: true, unit: true } },
            },
          },
          supplier: true,
          location: true,
        },
      });
    });
  }

  async submitPurchaseOrder(id: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT orders can be submitted');
      }
      const submitter = userId ?? po.createdById;
      const submitted = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedById: submitter,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
        include: { supplier: true, items: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'SUBMIT',
          module: 'PURCHASE_ORDERS',
          entityType: 'PurchaseOrder',
          recordId: id,
          oldData: po,
          newData: submitted,
          userId: submitter,
          userName: null,
        },
      });
      return submitted;
    });
  }

  async approvePurchaseOrder(
    id: string,
    userId: string,
    dto: ApprovePurchaseOrderDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status !== 'SUBMITTED') {
        throw new BadRequestException('Only SUBMITTED orders can be approved');
      }
      // Segregation of duties — approver cannot be the submitter or the creator.
      if (po.createdById === userId || po.submittedById === userId) {
        throw new BadRequestException(
          'Approver cannot be the same user as the submitter or creator (segregation of duties).',
        );
      }
      const approved = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date(),
          approvalNotes: dto.approvalNotes,
          version: { increment: 1 },
        },
        include: { supplier: true, items: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'APPROVE',
          module: 'PURCHASE_ORDERS',
          entityType: 'PurchaseOrder',
          recordId: id,
          oldData: po,
          newData: approved,
          reason: dto.approvalNotes ?? null,
          userId,
          userName: null,
        },
      });
      return approved;
    });
  }

  async cancelPurchaseOrder(id: string, userId?: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (['FULLY_RECEIVED', 'CANCELLED'].includes(po.status)) {
        throw new BadRequestException('Cannot cancel this order');
      }
      const cancelled = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          version: { increment: 1 },
        },
        include: { supplier: true, items: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'CANCEL',
          module: 'PURCHASE_ORDERS',
          entityType: 'PurchaseOrder',
          recordId: id,
          oldData: po,
          newData: cancelled,
          reason: reason ?? null,
          userId: userId ?? null,
          userName: null,
        },
      });
      return cancelled;
    });
  }


  // ─────────────────────────────────────────────
  // DELIVERIES
  // ─────────────────────────────────────────────

  async createDelivery(dto: CreateDeliveryDto, userId: string) {
    if (!dto.purchaseOrderId || !dto.locationId || !dto.items?.length) {
      throw new BadRequestException(
        'Missing required fields: purchaseOrderId, locationId, or items',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const po = await tx.purchaseOrder.findUnique({
          where: { id: dto.purchaseOrderId },
          include: { items: true },
        });

        if (!po) throw new NotFoundException('Purchase order not found');
        if (po.status === 'CANCELLED') {
          throw new BadRequestException(
            'Cannot deliver to a cancelled purchase order',
          );
        }
        if (po.status === 'FULLY_RECEIVED') {
          throw new ConflictException(
            'Purchase order is already fully received',
          );
        }

        if (dto.supplierRef) {
          const existing = await tx.delivery.findFirst({
            where: {
              purchaseOrderId: dto.purchaseOrderId,
              supplierRef: dto.supplierRef,
            },
          });
          if (existing) {
            throw new ConflictException(
              `Delivery already recorded for this PO with supplier ref "${dto.supplierRef}"`,
            );
          }
        }

        const delivery = await tx.delivery.create({
          data: {
            deliveryCode: genCode('DEL'),
            purchaseOrderId: dto.purchaseOrderId,
            locationId: dto.locationId,
            deliveryDate: dto.deliveryDate
              ? new Date(dto.deliveryDate)
              : new Date(),
            supplierRef: dto.supplierRef,
            invoiceNumber: dto.invoiceNumber,
            notes: dto.notes,
            status: dto.status || DeliveryStatus.COMPLETE,
            receivedById: userId,
          },
        });

        await Promise.all(
          dto.items.map((item) =>
            this.processDeliveryItem(tx, {
              deliveryId: delivery.id,
              item,
              poItems: po.items,
              locationId: dto.locationId,
              purchaseOrderId: po.id,
              userId,
            }),
          ),
        );

        const finalStatus = await this.calculatePurchaseOrderStatus(tx, po.id);
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: finalStatus },
        });

        return tx.delivery.findUnique({
          where: { id: delivery.id },
          include: {
            items: {
              include: {
                purchaseOrderItem: true,
                inventoryItem: {
                  select: {
                    id: true,
                    name: true,
                    unit: true,
                    uom: true,
                    // ✅ Include locationStocks instead of quantity
                    locationStocks: {
                      where: { locationId: dto.locationId },
                      select: { quantity: true },
                    },
                  },
                },
              },
            },
            purchaseOrder: { include: { items: true, supplier: true } },
            location: true,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  private async processDeliveryItem(
    tx: Prisma.TransactionClient,
    params: {
      deliveryId: string;
      item: CreateDeliveryItemDto;
      poItems: any[];
      locationId: string;
      purchaseOrderId: string;
      userId: string;
    },
  ) {
    const { deliveryId, item, poItems, locationId, purchaseOrderId, userId } =
      params;

    const poItem = poItems.find((i) => i.id === item.purchaseOrderItemId);
    if (!poItem) {
      throw new BadRequestException(
        `PO item ${item.purchaseOrderItemId} not found`,
      );
    }
    if (!poItem.inventoryItemId) {
      throw new BadRequestException(
        `PO item "${poItem.itemName}" must be linked to an inventory item before receiving`,
      );
    }

    const ordered = new Decimal(poItem.quantityOrdered.toString());
    const previouslyReceived = new Decimal(poItem.quantityReceived.toString());
    const nowReceiving = new Decimal(String(item.quantityAccepted || 0));
    const maxAllowed = ordered.minus(previouslyReceived);
    const maxWithTolerance = maxAllowed.times(
      new Decimal('1').plus(DELIVERY_CONFIG.MAX_OVER_DELIVERY_PCT),
    );

    if (nowReceiving.greaterThan(maxWithTolerance)) {
      throw new BadRequestException(
        `Cannot accept ${nowReceiving} for "${poItem.itemName}". ` +
        `Maximum allowed: ${maxAllowed.toFixed(4)} ` +
        `(+${DELIVERY_CONFIG.MAX_OVER_DELIVERY_PCT.times(100)}% tolerance = ${maxWithTolerance.toFixed(2)})`,
      );
    }

    const newTotalReceived = previouslyReceived.plus(nowReceiving);
    const effectiveUnitCost = item.unitCost || poItem.unitCost;
    const batchNumber = item.batchNumber || null;
    const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;

    const deliveryItem = await tx.deliveryItem.create({
      data: {
        deliveryId,
        purchaseOrderItemId: item.purchaseOrderItemId,
        itemType: 'INVENTORY',
        inventoryItemId: poItem.inventoryItemId,
        itemName: poItem.itemName,
        unit: poItem.unit,
        uom: poItem.uom,
        quantityDelivered: new Decimal(
          String(item.quantityDelivered || 0),
        ).toNumber(),
        quantityAccepted: nowReceiving.toNumber(),
        quantityRejected: new Decimal(
          String(item.quantityRejected || 0),
        ).toNumber(),
        quantityBilled: new Decimal(
          String(item.quantityBilled ?? item.quantityAccepted ?? 0),
        ).toNumber(),
        rejectionReason: item.rejectionReason,
        unitCost: effectiveUnitCost,
        total: nowReceiving
          .times(new Decimal(String(effectiveUnitCost)))
          .toNumber(),
        batchNumber,
        expiryDate,
        notes: item.notes,
      },
    });

    await tx.purchaseOrderItem.update({
      where: { id: item.purchaseOrderItemId },
      data: { quantityReceived: newTotalReceived.toNumber() },
    });

    if (nowReceiving.greaterThan(0)) {
      await this.updateStockOnReceipt(tx, {
        inventoryItemId: poItem.inventoryItemId,
        locationId,
        purchaseOrderId,
        deliveryId: deliveryId,
        quantityAccepted: nowReceiving,
        unitCost: effectiveUnitCost,
        batchNumber,
        expiryDate,
        itemUnit: poItem.unit,
        userId,
      });
    }

    return {
      itemId: deliveryItem.id,
      itemName: poItem.itemName,
      quantityAccepted: nowReceiving.toNumber(),
      remaining: ordered.minus(newTotalReceived).toNumber(),
      isComplete: ordered
        .minus(newTotalReceived)
        .lessThanOrEqualTo(DELIVERY_CONFIG.EPSILON),
    };
  }

  /**
   * Core stock update on receipt — keeps THREE things in sync:
   *  1. InventoryBatch          (batch-level truth)
   *  2. InventoryLocationStock  (location summary)
   *  3. InventoryLedger         (immutable transaction ledger)
   *
   *  ❌ NO LONGER UPDATES: InventoryItem.quantity (removed from schema)
   */
  /**
   * Core stock update on receipt — handles batch tracking logic:
   * - If item.batchTracking === true: MUST have batchNumber & expiryDate, create new batch row
   * - If item.batchTracking === false: use implicit "DEFAULT" batch, upsert quantity only
   */

  /**
   * Core stock update on receipt — keeps THREE things in sync:
   *  1. InventoryBatch          (batch-level truth)
   *  2. InventoryLocationStock  (location summary = SUM of batch quantities)
   *  3. InventoryLedger         (immutable transaction ledger)
   *
   *  ✅ InventoryLocationStock.quantity is CALCULATED from batches, not directly updated
   */
  private async updateStockOnReceipt(
    tx: Prisma.TransactionClient,
    params: {
      inventoryItemId: string;
      locationId: string;
      purchaseOrderId: string;
      deliveryId: string;
      quantityAccepted: Decimal;
      unitCost: number;
      batchNumber: string | null;
      expiryDate: Date | null;
      itemUnit: string;
      userId: string;
    },
  ) {
    const {
      inventoryItemId,
      locationId,
      purchaseOrderId,
      deliveryId,
      quantityAccepted,
      unitCost,
      batchNumber,
      expiryDate,
      itemUnit,
      userId,
    } = params;

    const qtyNum = quantityAccepted.toNumber();
    const totalValue = quantityAccepted
      .times(new Decimal(String(unitCost)))
      .toNumber();

    // ── Fetch item to check batchTracking flag ─────────────────────────────
    const item = await tx.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: { id: true, name: true, batchTracking: true },
    });

    if (!item)
      throw new NotFoundException(
        `Inventory item ${inventoryItemId} not found`,
      );

    // ── VALIDATION: Enforce batch details if batchTracking is enabled ──────
    if (item.batchTracking) {
      if (!batchNumber || batchNumber.trim() === '') {
        throw new BadRequestException(
          `Item "${item.name}" has batch tracking enabled. Batch number is required.`,
        );
      }
      if (!expiryDate) {
        throw new BadRequestException(
          `Item "${item.name}" has batch tracking enabled. Expiry date is required.`,
        );
      }
    }

    // ── Resolve batch identifier ───────────────────────────────────────────
    const resolvedBatchNumber = item.batchTracking
      ? batchNumber!.trim()
      : 'DEFAULT';

    // ── 1. Handle InventoryBatch (batch-level truth) ───────────────────────
    let batchId: string;

    if (item.batchTracking) {
      // ✅ BATCH TRACKING ENABLED: Create NEW batch row for each distinct batch
      const existingBatch = await tx.inventoryBatch.findUnique({
        where: {
          itemId_locationId_batchNumber: {
            itemId: inventoryItemId,
            locationId,
            batchNumber: resolvedBatchNumber,
          },
        },
        select: { id: true, quantity: true },
      });

      if (existingBatch) {
        const updated = await tx.inventoryBatch.update({
          where: { id: existingBatch.id },
          data: {
            quantity: { increment: qtyNum },
            unitCost,
            ...(expiryDate && { expiryDate }),
            isActive: true,
          },
          select: { id: true },
        });
        batchId = updated.id;
      } else {
        const created = await tx.inventoryBatch.create({
          data: {
            itemId: inventoryItemId,
            locationId,
            batchNumber: resolvedBatchNumber,
            expiryDate,
            quantity: qtyNum,
            unitCost,
            isActive: true,
          },
          select: { id: true },
        });
        batchId = created.id;
      }
    } else {
      // ❌ NO BATCH TRACKING: Use ONE implicit "DEFAULT" batch per item+location
      const existingDefaultBatch = await tx.inventoryBatch.findUnique({
        where: {
          itemId_locationId_batchNumber: {
            itemId: inventoryItemId,
            locationId,
            batchNumber: 'DEFAULT',
          },
        },
        select: { id: true, quantity: true },
      });

      if (existingDefaultBatch) {
        const updated = await tx.inventoryBatch.update({
          where: { id: existingDefaultBatch.id },
          data: {
            quantity: { increment: qtyNum },
            unitCost,
            isActive: true,
          },
          select: { id: true },
        });
        batchId = updated.id;
      } else {
        const created = await tx.inventoryBatch.create({
          data: {
            itemId: inventoryItemId,
            locationId,
            batchNumber: 'DEFAULT',
            expiryDate: null,
            quantity: qtyNum,
            unitCost,
            isActive: true,
          },
          select: { id: true },
        });
        batchId = created.id;
      }
    }

    // ── 2. RECALCULATE InventoryLocationStock from batch sums ─────────────
    // ✅ This ensures location stock ALWAYS matches the sum of active batches
    const batchSum = await tx.inventoryBatch.aggregate({
      where: {
        itemId: inventoryItemId,
        locationId,
        isActive: true,
      },
      _sum: { quantity: true },
    });

    const calculatedLocationQty = batchSum._sum.quantity ?? 0;

    // Upsert location stock with CALCULATED value (not increment)
    await tx.inventoryLocationStock.upsert({
      where: {
        itemId_locationId: { itemId: inventoryItemId, locationId },
      },
      create: {
        itemId: inventoryItemId,
        locationId,
        quantity: calculatedLocationQty,
        minQuantity: 0,
      },
      update: {
        quantity: calculatedLocationQty, // ✅ Set to calculated sum, not increment
      },
    });

    // ── 3. Write InventoryLedger entry ────────────────────────────────────
    const locationQtyBefore = calculatedLocationQty - qtyNum; // Approximate for ledger

    await tx.inventoryLedger.create({
      data: {
        ledgerCode: genCode('ILG'),
        itemId: inventoryItemId,
        locationId,
        batchId,
        type: StockLedgerType.PURCHASE_RECEIPT,
        quantityBefore: locationQtyBefore,
        quantityChange: qtyNum,
        quantityAfter: calculatedLocationQty,
        unitCost,
        totalValue,
        referenceType: 'DELIVERY',
        referenceId: deliveryId,
        notes: `Purchase receipt: ${qtyNum} ${itemUnit} @ ${unitCost}`,
        performedById: userId,
        deliveryId,
      },
    });

    return batchId;
  }

  // private async updateStockOnReceipt(
  //   tx: Prisma.TransactionClient,
  //   params: {
  //     inventoryItemId: string;
  //     locationId: string;
  //     purchaseOrderId: string;
  //     deliveryId: string;
  //     quantityAccepted: Decimal;
  //     unitCost: number;
  //     batchNumber: string | null;
  //     expiryDate: Date | null;
  //     itemUnit: string;
  //     userId: string;
  //   },
  // ) {
  //   const {
  //     inventoryItemId,
  //     locationId,
  //     purchaseOrderId,
  //     deliveryId,
  //     quantityAccepted,
  //     unitCost,
  //     batchNumber,
  //     expiryDate,
  //     itemUnit,
  //     userId,
  //   } = params;

  //   const qtyNum = quantityAccepted.toNumber();
  //   const totalValue = quantityAccepted
  //     .times(new Decimal(String(unitCost)))
  //     .toNumber();

  //   // ── Fetch item to check batchTracking flag ─────────────────────────────
  //   const item = await tx.inventoryItem.findUnique({
  //     where: { id: inventoryItemId },
  //     select: { id: true, name: true, batchTracking: true },
  //   });

  //   if (!item)
  //     throw new NotFoundException(
  //       `Inventory item ${inventoryItemId} not found`,
  //     );

  //   // ── VALIDATION: Enforce batch details if batchTracking is enabled ──────
  //   if (item.batchTracking) {
  //     if (!batchNumber || batchNumber.trim() === '') {
  //       throw new BadRequestException(
  //         `Item "${item.name}" has batch tracking enabled. Batch number is required.`,
  //       );
  //     }
  //     if (!expiryDate) {
  //       throw new BadRequestException(
  //         `Item "${item.name}" has batch tracking enabled. Expiry date is required.`,
  //       );
  //     }
  //   }

  //   // ── Resolve batch identifier ───────────────────────────────────────────
  //   // If batchTracking is OFF, use implicit "DEFAULT" batch key
  //   const resolvedBatchNumber = item.batchTracking
  //     ? batchNumber!.trim()
  //     : 'DEFAULT';

  //   // ── 1. Handle InventoryBatch (batch-level truth) ───────────────────────
  //   let batchId: string;

  //   if (item.batchTracking) {
  //     // ✅ BATCH TRACKING ENABLED: Create NEW batch row for each distinct batch
  //     const existingBatch = await tx.inventoryBatch.findUnique({
  //       where: {
  //         itemId_locationId_batchNumber: {
  //           itemId: inventoryItemId,
  //           locationId,
  //           batchNumber: resolvedBatchNumber,
  //         },
  //       },
  //       select: { id: true, quantity: true },
  //     });

  //     if (existingBatch) {
  //       // Update existing batch
  //       const updated = await tx.inventoryBatch.update({
  //         where: { id: existingBatch.id },
  //         data: {
  //           quantity: { increment: qtyNum },
  //           unitCost,
  //           ...(expiryDate && { expiryDate }),
  //           isActive: true,
  //         },
  //         select: { id: true },
  //       });
  //       batchId = updated.id;
  //     } else {
  //       // Create new batch row
  //       const created = await tx.inventoryBatch.create({
  //         data: {
  //           itemId: inventoryItemId,
  //           locationId,
  //           batchNumber: resolvedBatchNumber,
  //           expiryDate,
  //           quantity: qtyNum,
  //           unitCost,
  //           isActive: true,
  //         },
  //         select: { id: true },
  //       });
  //       batchId = created.id;
  //     }
  //   } else {
  //     // ❌ NO BATCH TRACKING: Use ONE implicit "DEFAULT" batch per item+location
  //     const existingDefaultBatch = await tx.inventoryBatch.findUnique({
  //       where: {
  //         itemId_locationId_batchNumber: {
  //           itemId: inventoryItemId,
  //           locationId,
  //           batchNumber: 'DEFAULT',
  //         },
  //       },
  //       select: { id: true, quantity: true },
  //     });

  //     if (existingDefaultBatch) {
  //       // UPDATE existing null-batch row
  //       const updated = await tx.inventoryBatch.update({
  //         where: { id: existingDefaultBatch.id },
  //         data: {
  //           quantity: { increment: qtyNum },
  //           unitCost, // update cost to latest
  //           isActive: true,
  //           // Do NOT set expiryDate for non-batch-tracked items
  //         },
  //         select: { id: true },
  //       });
  //       batchId = updated.id;
  //     } else {
  //       // CREATE new implicit batch row
  //       const created = await tx.inventoryBatch.create({
  //         data: {
  //           itemId: inventoryItemId,
  //           locationId,
  //           batchNumber: 'DEFAULT', // implicit key
  //           expiryDate: null, // no expiry for non-batch items
  //           quantity: qtyNum,
  //           unitCost,
  //           isActive: true,
  //         },
  //         select: { id: true },
  //       });
  //       batchId = created.id;
  //     }
  //   }

  //   // ── 2. Upsert InventoryLocationStock (location summary) ───────────────
  //   const existingLocationStock = await tx.inventoryLocationStock.findUnique({
  //     where: {
  //       itemId_locationId: { itemId: inventoryItemId, locationId },
  //     },
  //     select: { id: true, quantity: true },
  //   });

  //   if (existingLocationStock) {
  //     await tx.inventoryLocationStock.update({
  //       where: { id: existingLocationStock.id },
  //       data: { quantity: { increment: qtyNum } },
  //     });
  //   } else {
  //     await tx.inventoryLocationStock.create({
  //       data: {
  //         itemId: inventoryItemId,
  //         locationId,
  //         quantity: qtyNum,
  //         minQuantity: 0,
  //       },
  //     });
  //   }

  //   // ── 3. Write InventoryLedger entry ────────────────────────────────────
  //   const locationQtyBefore = existingLocationStock
  //     ? new Decimal(existingLocationStock.quantity.toString())
  //     : new Decimal('0');

  //   await tx.inventoryLedger.create({
  //     data: {
  //       ledgerCode: genCode('ILG'),
  //       itemId: inventoryItemId,
  //       locationId,
  //       batchId, // link to the resolved batch (real or DEFAULT)
  //       type: StockLedgerType.PURCHASE_RECEIPT,
  //       quantityBefore: locationQtyBefore.toNumber(),
  //       quantityChange: qtyNum,
  //       quantityAfter: locationQtyBefore.plus(quantityAccepted).toNumber(),
  //       unitCost,
  //       totalValue,
  //       referenceType: 'DELIVERY',
  //       referenceId: deliveryId,
  //       notes: `Purchase receipt: ${qtyNum} ${itemUnit} @ ${unitCost}`,
  //       performedById: userId,
  //       deliveryId,
  //     },
  //   });

  //   return batchId;
  // }
  // private async updateStockOnReceipt(
  //   tx: Prisma.TransactionClient,
  //   params: {
  //     inventoryItemId: string;
  //     locationId: string;
  //     purchaseOrderId: string;
  //     deliveryId: string;
  //     quantityAccepted: Decimal;
  //     unitCost: number;
  //     batchNumber: string | null;
  //     expiryDate: Date | null;
  //     itemUnit: string;
  //     userId: string;
  //   },
  // ) {
  //   const {
  //     inventoryItemId,
  //     locationId,
  //     purchaseOrderId,
  //     deliveryId,
  //     quantityAccepted,
  //     unitCost,
  //     batchNumber,
  //     expiryDate,
  //     itemUnit,
  //     userId,
  //   } = params;

  //   const qtyNum = quantityAccepted.toNumber();
  //   const totalValue = quantityAccepted.times(new Decimal(String(unitCost))).toNumber();

  //   // ❌ REMOVED: Reading/updating global inventoryItem.quantity
  //   // const currentItem = await tx.inventoryItem.findUnique({...});

  //   // ── 1. Upsert InventoryBatch (batch-level truth) ───────────────────────
  //   const resolvedBatchNumber = batchNumber || 'DEFAULT';

  //   const existingBatch = await tx.inventoryBatch.findUnique({
  //     where: {
  //       itemId_locationId_batchNumber: {
  //         itemId: inventoryItemId,
  //         locationId,
  //         batchNumber: resolvedBatchNumber,
  //       },
  //     },
  //     select: { id: true, quantity: true },
  //   });

  //   let batch: { id: string; quantity: number };

  //   if (existingBatch) {
  //     batch = await tx.inventoryBatch.update({
  //       where: { id: existingBatch.id },
  //       data: {
  //         quantity: { increment: qtyNum },
  //         unitCost,
  //         ...(expiryDate ? { expiryDate } : {}),
  //         isActive: true,
  //       },
  //       select: { id: true, quantity: true },
  //     });
  //   } else {
  //     batch = await tx.inventoryBatch.create({
  //       data: {
  //         itemId: inventoryItemId,
  //         locationId,
  //         batchNumber: resolvedBatchNumber,
  //         expiryDate,
  //         quantity: qtyNum,
  //         unitCost,
  //         isActive: true,
  //       },
  //       select: { id: true, quantity: true },
  //     });
  //   }

  //   // ── 2. Upsert InventoryLocationStock (location summary) ───────────────
  //   const existingLocationStock = await tx.inventoryLocationStock.findUnique({
  //     where: {
  //       itemId_locationId: {
  //         itemId: inventoryItemId,
  //         locationId,
  //       },
  //     },
  //     select: { id: true, quantity: true }, // ✅ Select id for update
  //   });

  //   if (existingLocationStock) {
  //     await tx.inventoryLocationStock.update({
  //       where: { id: existingLocationStock.id }, // ✅ Use id for update
  //       data: { quantity: { increment: qtyNum } },
  //     });
  //   } else {
  //     await tx.inventoryLocationStock.create({
  //       data: {
  //         itemId: inventoryItemId,
  //         locationId,
  //         quantity: qtyNum,
  //         minQuantity: 0,
  //       },
  //     });
  //   }

  //   // ── 3. Write InventoryLedger entry ────────────────────────────────────
  //   const locationQtyBefore = existingLocationStock
  //     ? new Decimal(existingLocationStock.quantity.toString())
  //     : new Decimal('0');

  //   await tx.inventoryLedger.create({
  //     data: {
  //       ledgerCode: genCode('ILG'),
  //       itemId: inventoryItemId,
  //       locationId,
  //       batchId: batch.id,
  //       type: StockLedgerType.PURCHASE_RECEIPT,
  //       quantityBefore: locationQtyBefore.toNumber(),
  //       quantityChange: qtyNum,
  //       quantityAfter: locationQtyBefore.plus(quantityAccepted).toNumber(),
  //       unitCost,
  //       totalValue,
  //       referenceType: 'DELIVERY',
  //       referenceId: deliveryId,
  //       notes: `Purchase receipt: ${qtyNum} ${itemUnit} @ ${unitCost}`,
  //       performedById: userId,
  //       deliveryId,
  //     },
  //   });
  // }

  private async calculatePurchaseOrderStatus(
    tx: Prisma.TransactionClient,
    poId: string,
  ): Promise<PurchaseOrderStatus> {
    const items = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: poId },
    });

    if (items.length === 0) return PurchaseOrderStatus.DRAFT;

    const checks = items.map((item) => {
      const ordered = new Decimal(item.quantityOrdered.toString());
      const received = new Decimal(item.quantityReceived.toString());
      const remaining = ordered.minus(received);
      const isComplete = remaining.lessThanOrEqualTo(DELIVERY_CONFIG.EPSILON);
      const isPartial = received.greaterThan(0) && !isComplete;
      return { isComplete, isPartial };
    });

    if (checks.every((c) => c.isComplete))
      return PurchaseOrderStatus.FULLY_RECEIVED;
    if (checks.some((c) => c.isPartial || c.isComplete))
      return PurchaseOrderStatus.PARTIALLY_RECEIVED;
    return PurchaseOrderStatus.APPROVED;
  }

  async getDelivery(id: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            purchaseOrderItem: true,
            inventoryItem: {
              select: {
                id: true,
                name: true,
                unit: true,
                uom: true,
                // ✅ Include locationStocks instead of quantity
                locationStocks: { select: { quantity: true } },
              },
            },
          },
        },
        purchaseOrder: { include: { supplier: true, items: true } },
        location: true,
      },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async getPurchaseOrderDeliveries(purchaseOrderId: string) {
    return this.prisma.delivery.findMany({
      where: { purchaseOrderId },
      include: {
        items: true,
        location: { select: { id: true, name: true, type: true } },
      },
      orderBy: { deliveryDate: 'desc' },
    });
  }

  // ─────────────────────────────────────────────
  // PAYMENTS
  // ─────────────────────────────────────────────

  // FIX DOUBLE-PAY-PATH: the previous createPurchasePayment here duplicated
  // PaymentsService.createPurchaseOrderPayment and double-counted the PO
  // balance if both endpoints were exercised. This method now delegates to
  // the canonical row-locked transactional implementation in PaymentsService.
  async createPurchasePaymentViaPaymentsService(
    dto: CreatePurchasePaymentDto,
    userId: string,
  ) {
    return this.paymentsService.createPurchaseOrderPayment(
      dto.purchaseOrderId,
      Number(dto.amount),
      dto.method,
      userId,
      dto.reference,
      dto.bankName,
      dto.chequeNumber,
      dto.transactionId,
      dto.notes,
      dto.paidAt ? new Date(dto.paidAt) : undefined,
      dto.accountId,
    );
  }

  async getPurchasePayments(purchaseOrderId: string) {
  // Query the unified payments table, filtered to this PO
  return this.prisma.payment.findMany({
    where: { purchaseOrderId },
    orderBy: { paidAt: 'desc' },
  });
  }


  async createStockAdjustment(dto: CreateStockAdjustmentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          adjustmentCode: genCode('ADJ'),
          locationId: dto.locationId,
          reason: dto.reason,
          notes: dto.notes,
          status: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date(),
          performedById: userId,
          items: {
            create: dto.items.map((item) => ({
              inventoryItem: { connect: { id: item.inventoryItemId } },
              itemName: item.itemName,
              unit: item.unit,
              quantitySystem: item.quantitySystem,
              quantityActual: item.quantityActual,
              quantityDifference: item.quantityActual - item.quantitySystem,
              unitCost: item.unitCost ?? 0,
              batchNumber: item.batchNumber,
              notes: item.notes,
            })),
          },
        },
        include: { items: true },
      });

      for (const adjItem of adjustment.items) {
        const diff = adjItem.quantityDifference;
        if (diff === 0) continue;
        if (!adjItem.inventoryItemId) continue;

        // ❌ REMOVED: Global inventoryItem.quantity update
        // await tx.inventoryItem.update({ where: { id: adjItem.inventoryItemId }, data: { quantity: { increment: diff } } });

        // ── Update location stock summary ────────────────────────────────
        const locationStock = await tx.inventoryLocationStock.findUnique({
          where: {
            itemId_locationId: {
              itemId: adjItem.inventoryItemId,
              locationId: dto.locationId,
            },
          },
          select: { id: true, quantity: true },
        });

        if (locationStock) {
          await tx.inventoryLocationStock.update({
            where: { id: locationStock.id },
            data: { quantity: { increment: diff } },
          });
        } else if (diff > 0) {
          await tx.inventoryLocationStock.create({
            data: {
              itemId: adjItem.inventoryItemId,
              locationId: dto.locationId,
              quantity: diff,
              minQuantity: 0,
            },
          });
        }

        // ── Write ledger entry ───────────────────────────────────────────
        const qtyBefore = new Decimal(
          locationStock?.quantity?.toString() || '0',
        );
        const ledgerType =
          diff > 0
            ? StockLedgerType.ADJUSTMENT_IN
            : StockLedgerType.ADJUSTMENT_OUT;

        await tx.inventoryLedger.create({
          data: {
            ledgerCode: genCode('ILG'),
            itemId: adjItem.inventoryItemId,
            locationId: dto.locationId,
            type: ledgerType,
            quantityBefore: qtyBefore.toNumber(),
            quantityChange: diff,
            quantityAfter: qtyBefore.plus(new Decimal(String(diff))).toNumber(),
            unitCost: toNum(adjItem.unitCost),
            totalValue: Math.abs(diff) * toNum(adjItem.unitCost),
            referenceType: 'ADJUSTMENT',
            referenceId: adjustment.id,
            notes: `Stock adjustment: ${dto.reason}`,
            performedById: userId,
            stockAdjustmentId: adjustment.id,
          },
        });
      }

      return adjustment;
    });
  }

  async getStockAdjustments(locationId?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.StockAdjustmentWhereInput = locationId
      ? { locationId }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          items: true,
        },
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─────────────────────────────────────────────
  // WASTE RECORDS
  // ─────────────────────────────────────────────

  async createWasteRecord(dto: CreateWasteRecordDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      let totalValue = 0;
      const itemsWithCost = dto.items.map((item) => {
        const totalCost = item.quantity * (item.unitCost ?? 0);
        totalValue += totalCost;
        return { ...item, totalCost };
      });

      const waste = await tx.wasteRecord.create({
        data: {
          wasteCode: genCode('WST'),
          locationId: dto.locationId,
          category: dto.category,
          notes: dto.notes,
          witnessName: dto.witnessName,
          disposalMethod: dto.disposalMethod,
          disposalDate: dto.disposalDate
            ? new Date(dto.disposalDate)
            : undefined,
          reportedById: userId,
          approvedById: userId,
          approvedAt: new Date(),
          totalValue,
          items: {
            create: itemsWithCost.map((item) => ({
              itemType: 'INVENTORY',
              inventoryItem: { connect: { id: item.inventoryItemId } },
              itemName: item.itemName,
              unit: item.unit,
              quantity: item.quantity,
              unitCost: item.unitCost ?? 0,
              totalCost: item.totalCost,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate
                ? new Date(item.expiryDate)
                : undefined,
              reason: item.reason,
            })),
          },
        },
        include: { items: true },
      });

      for (const wasteItem of waste.items) {
        if (!wasteItem.inventoryItemId) continue;

        // ❌ REMOVED: Global inventoryItem.quantity update
        // await tx.inventoryItem.update({ where: { id: wasteItem.inventoryItemId }, data: { quantity: { decrement: wasteItem.quantity } } });

        // ── Decrement location stock summary ─────────────────────────────
        const locationStock = await tx.inventoryLocationStock.findUnique({
          where: {
            itemId_locationId: {
              itemId: wasteItem.inventoryItemId,
              locationId: dto.locationId,
            },
          },
          select: { id: true, quantity: true },
        });

        if (locationStock) {
          await tx.inventoryLocationStock.update({
            where: { id: locationStock.id },
            data: { quantity: { decrement: wasteItem.quantity } },
          });
        }

        // ── Decrement batch quantity (FIFO) ─────────────────────────────
        if (wasteItem.batchNumber) {
          const batch = await tx.inventoryBatch.findUnique({
            where: {
              itemId_locationId_batchNumber: {
                itemId: wasteItem.inventoryItemId,
                locationId: dto.locationId,
                batchNumber: wasteItem.batchNumber,
              },
            },
            select: { id: true, quantity: true },
          });

          if (batch) {
            const newBatchQty = batch.quantity - wasteItem.quantity;
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: {
                quantity: { decrement: wasteItem.quantity },
                isActive: newBatchQty > 0,
              },
            });
          }
        } else {
          const oldestBatch = await tx.inventoryBatch.findFirst({
            where: {
              itemId: wasteItem.inventoryItemId,
              locationId: dto.locationId,
              isActive: true,
              quantity: { gt: 0 },
            },
            orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
            select: { id: true, quantity: true },
          });

          if (oldestBatch) {
            const newBatchQty = oldestBatch.quantity - wasteItem.quantity;
            await tx.inventoryBatch.update({
              where: { id: oldestBatch.id },
              data: {
                quantity: { decrement: wasteItem.quantity },
                isActive: newBatchQty > 0,
              },
            });
          }
        }

        // ── Write ledger entry ───────────────────────────────────────────
        const qtyBefore = new Decimal(
          locationStock?.quantity?.toString() || '0',
        );

        await tx.inventoryLedger.create({
          data: {
            ledgerCode: genCode('ILG'),
            itemId: wasteItem.inventoryItemId,
            locationId: dto.locationId,
            type: StockLedgerType.WASTE,
            quantityBefore: qtyBefore.toNumber(),
            quantityChange: -wasteItem.quantity,
            quantityAfter: qtyBefore
              .minus(new Decimal(String(wasteItem.quantity)))
              .toNumber(),
            unitCost: toNum(wasteItem.unitCost),
            totalValue: wasteItem.quantity * toNum(wasteItem.unitCost),
            referenceType: 'WASTE',
            referenceId: waste.id,
            notes: `Waste recorded: ${dto.category}`,
            performedById: userId,
            wasteRecordId: waste.id,
          },
        });
      }

      return waste;
    });
  }

  async getWasteRecords(locationId?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.WasteRecordWhereInput = locationId
      ? { locationId }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.wasteRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          items: true,
        },
      }),
      this.prisma.wasteRecord.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ─────────────────────────────────────────────
  // INVENTORY LEDGER
  // ─────────────────────────────────────────────

  async getInventoryLedger(query: InventoryLedgerQueryDto) {
    const {
      locationId,
      itemId,
      type,
      referenceType,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = query;

    const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.InventoryLedgerWhereInput = {
      ...(locationId && { locationId }),
      ...(itemId && { itemId }),
      ...(type && { type: type as StockLedgerType }),
      ...(referenceType && { referenceType }),
      ...(dateFrom || dateTo
        ? {
          createdAt: {
            gte: dateFrom ? new Date(dateFrom) : undefined,
            lte: dateTo ? new Date(dateTo) : undefined,
          },
        }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.inventoryLedger.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          item: { select: { id: true, name: true, unit: true } },
          batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        },
      }),
      this.prisma.inventoryLedger.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  // ─────────────────────────────────────────────
  // LOCATION STOCK
  // ─────────────────────────────────────────────

  async getLocationStock(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    const locationStocks = await this.prisma.inventoryLocationStock.findMany({
      where: { locationId },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            itemCode: true,
            unit: true,
            uom: true,
            unitCost: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { item: { name: 'asc' } },
    });

    const batches = await this.prisma.inventoryBatch.findMany({
      where: { locationId, isActive: true, quantity: { gt: 0 } },
      include: {
        item: { select: { id: true, name: true, unit: true } },
      },
      orderBy: [{ item: { name: 'asc' } }, { expiryDate: 'asc' }],
    });

    return {
      location,
      items: locationStocks.map((s) => ({
        id: s.item.id,
        name: s.item.name,
        code: s.item.itemCode,
        unit: s.item.unit,
        uom: s.item.uom,
        unitCost: s.item.unitCost,
        currentStock: s.quantity,
        minQuantity: s.minQuantity,
        category: s.item.category?.name ?? null,
      })),
      batches: batches.map((b) => ({
        id: b.id,
        itemId: b.itemId,
        itemName: b.item.name,
        batchNumber: b.batchNumber === 'DEFAULT' ? null : b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
        unitCost: b.unitCost,
        receivedAt: b.receivedAt,
        isExpiringSoon: b.expiryDate
          ? b.expiryDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : false,
      })),
    };
  }

  // ─────────────────────────────────────────────
  // DASHBOARD — PRODUCTION READY
  // ─────────────────────────────────────────────

  async getPurchaseDashboard(locationId?: string) {
    const [totalPOs, pendingPOs, totalPaidAgg, totalOutstandingAgg, recentPOs] =
      await Promise.all([
        this.prisma.purchaseOrder.count(),
        this.prisma.purchaseOrder.count({
          where: { status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } },
        }),
        this.prisma.purchaseOrder.aggregate({ _sum: { amountPaid: true } }),
        this.prisma.purchaseOrder.aggregate({
          _sum: { balance: true },
          where: { paymentStatus: { not: 'PAID' } },
        }),
        this.prisma.purchaseOrder.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { supplier: { select: { name: true } } },
        }),
      ]);

    // ✅ Low stock: fetch items with locationStocks, then filter in JS
    const allActiveItems = await this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        minQuantity: true,
        unit: true,
        unitCost: true,
        locationStocks: {
          ...(locationId && { where: { locationId } }),
          select: { quantity: true },
        },
      },
    });

    const lowStockItems = allActiveItems
      .map((item) => {
        const totalQty = item.locationStocks.reduce(
          (sum, s) => sum + s.quantity,
          0,
        );
        return { ...item, totalQuantity: totalQty };
      })
      .filter((i) => i.totalQuantity <= i.minQuantity)
      .slice(0, 10); // Limit to top 10

    // ✅ Expiring batches
    const expiringBatches = await this.prisma.inventoryBatch.findMany({
      where: {
        isActive: true,
        quantity: { gt: 0 },
        expiryDate: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          gte: new Date(),
        },
        ...(locationId && { locationId }),
      },
      include: {
        item: { select: { name: true, unit: true } },
        location: { select: { name: true } },
      },
      orderBy: { expiryDate: 'asc' },
      take: 10,
    });

    return {
      totalPOs,
      pendingPOs,
      totalPaid: totalPaidAgg._sum.amountPaid ?? 0,
      totalOutstanding: totalOutstandingAgg._sum.balance ?? 0,
      recentPOs,
      lowStockItems: lowStockItems.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        unitCost: i.unitCost,
        currentStock: i.totalQuantity, // ✅ Aggregated from locationStocks
        minQuantity: i.minQuantity,
      })),
      expiringBatches,
    };
  }
}
