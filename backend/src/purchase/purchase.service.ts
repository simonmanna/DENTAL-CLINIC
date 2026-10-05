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
} from '@prisma/client';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ApprovePurchaseOrderDto,
  CreateDeliveryDto,
  CreatePurchasePaymentDto,
  PurchaseOrderQueryDto,
  InventoryLedgerQueryDto,
  CreateDeliveryItemDto,
} from './dto/purchase.dto';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';
import { PaymentsService } from '../payments/payments.service';

import Decimal from 'decimal.js';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// Money is stored in Decimal(10,2) columns, so every figure that lands in one
// is rounded to 2 dp here rather than letting the driver truncate silently.
function money(d: Decimal): number {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
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
    private readonly movements: StockMovementService,
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
  // HELPER: Purchase-order totals — ONE Decimal pass, ONE tax basis
  // ─────────────────────────────────────────────
  //
  //   subtotal = SUM(qty * unitCost - lineDiscount)
  //   tax      = line tax if ANY line carries a taxPercent,
  //              otherwise the header taxPercent applied to subtotal.
  //              Never both — the old code folded line tax into `subtotal`
  //              and then taxed that subtotal again (tax on tax).
  //   total    = subtotal + tax - headerDiscount + shipping
  //
  // Line tax is charged on the line NET of its own discount, which is what a
  // supplier invoice does.
  private computeOrderTotals(
    items: Array<{
      quantityOrdered: number | string;
      unitCost: number | string;
      taxPercent?: number | string | null;
      discount?: number | string | null;
    }>,
    header: {
      taxPercent?: number | string | null;
      discountAmount?: number | string | null;
      shippingCost?: number | string | null;
    },
  ) {
    const lines = items.map((item) => {
      const gross = new Decimal(String(item.quantityOrdered ?? 0)).times(
        new Decimal(String(item.unitCost ?? 0)),
      );
      const discount = new Decimal(String(item.discount ?? 0));
      const net = gross.minus(discount);
      const taxPercent = new Decimal(String(item.taxPercent ?? 0));
      const tax = net.times(taxPercent.div(100));
      return { net, tax, taxPercent };
    });

    const subtotal = lines.reduce((sum, l) => sum.plus(l.net), new Decimal(0));
    const lineTax = lines.reduce((sum, l) => sum.plus(l.tax), new Decimal(0));
    const usesLineTax = lines.some((l) => l.taxPercent.greaterThan(0));

    const headerTaxPercent = new Decimal(String(header.taxPercent ?? 0));
    const taxAmount = usesLineTax
      ? lineTax
      : subtotal.times(headerTaxPercent.div(100));

    // Store the blended rate when the tax came from the lines, so the header
    // field stays a faithful description of taxAmount instead of a second,
    // independently applied rate.
    const effectiveTaxPercent = usesLineTax
      ? subtotal.isZero()
        ? new Decimal(0)
        : taxAmount.div(subtotal).times(100)
      : headerTaxPercent;

    const discountAmount = new Decimal(String(header.discountAmount ?? 0));
    const shippingCost = new Decimal(String(header.shippingCost ?? 0));
    const total = subtotal
      .plus(taxAmount)
      .minus(discountAmount)
      .plus(shippingCost);

    if (total.lessThan(0)) {
      throw new BadRequestException(
        `Order total would be negative (${total.toFixed(2)}). ` +
          `Check the discount and shipping figures.`,
      );
    }

    return {
      subtotal: money(subtotal),
      taxPercent: Number(
        effectiveTaxPercent.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      ),
      taxAmount: money(taxAmount),
      discountAmount: money(discountAmount),
      shippingCost: money(shippingCost),
      total: money(total),
      // Per-line totals, aligned with the chosen tax basis.
      lineTotals: lines.map((l) =>
        money(usesLineTax ? l.net.plus(l.tax) : l.net),
      ),
    };
  }

  // ─────────────────────────────────────────────
  // PURCHASE ORDERS
  // ─────────────────────────────────────────────

  async createPurchaseOrder(dto: CreatePurchaseOrderDto, userId: string) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        'A purchase order needs at least one line item.',
      );
    }

    const sanitizedItems = dto.items.map((item) => ({
      ...item,
      quantityOrdered: Number(item.quantityOrdered),
      unitCost: Number(item.unitCost),
      taxPercent: Number(item.taxPercent || 0),
      discount: Number(item.discount || 0),
    }));

    const totals = this.computeOrderTotals(sanitizedItems, dto);

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { id: true, isActive: true, name: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
      if (!supplier.isActive) {
        throw new BadRequestException(
          `Supplier "${supplier.name}" is inactive and cannot be ordered from.`,
        );
      }

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
          // Always DRAFT. The status is NOT client-settable: accepting it from
          // the payload let a caller POST an already-APPROVED order and skip
          // both the submit→approve sequence and the segregation-of-duties
          // check in approvePurchaseOrder.
          status: PurchaseOrderStatus.DRAFT,
          taxPercent: totals.taxPercent,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          shippingCost: totals.shippingCost,
          subtotal: totals.subtotal,
          total: totals.total,
          balance: totals.total,
          paymentStatus: 'UNPAID',
          supplierId: dto.supplierId,
          locationId: dto.locationId,
          createdById: userId,
        },
      });

      await tx.purchaseOrderItem.createMany({
        data: sanitizedItems.map((item, idx) => ({
          purchaseOrderId: po.id,
          itemName: item.itemName,
          unit: item.unit,
          uom: item.uom || 'PIECES',
          quantityOrdered: item.quantityOrdered,
          quantityReceived: 0,
          unitCost: item.unitCost,
          taxPercent: item.taxPercent,
          discount: item.discount,
          total: totals.lineTotals[idx],
          batchNumber: item.batchNumber || null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
          notes: item.notes || null,
          inventoryItemId: item.inventoryItemId || null,
        })),
      });

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
    const { items, ...rest } = dto as any;

    // UpdatePurchaseOrderDto is a PartialType of the create DTO, so `status`
    // is absent from it by construction — but this method spreads `updateData`
    // straight onto the row, so the field is dropped here as well rather than
    // relying on that. Status moves only through submit / approve / cancel.
    const updateData = { ...rest };
    delete updateData.status;

    return this.prisma.$transaction(
      async (tx) => {
        // Read the order INSIDE the transaction. Reading it outside left a
        // window in which the order could be submitted between the DRAFT check
        // and the write, so an in-flight approval could be edited underneath.
        const po = await tx.purchaseOrder.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!po) throw new NotFoundException('Purchase order not found');
        if (po.status !== PurchaseOrderStatus.DRAFT) {
          throw new BadRequestException('Only DRAFT orders can be edited');
        }

        // Recompute totals on EVERY path. The previous no-items branch spread
        // taxPercent / discountAmount / shippingCost straight onto the row and
        // left `total` and `balance` describing the old figures.
        const sourceItems = items
          ? items.map((item: any) => ({
              ...item,
              quantityOrdered: Number(item.quantityOrdered),
              unitCost: Number(item.unitCost),
              taxPercent: Number(item.taxPercent ?? 0),
              discount: Number(item.discount ?? 0),
            }))
          : po.items.map((item) => ({
              quantityOrdered: toNum(item.quantityOrdered),
              unitCost: toNum(item.unitCost),
              taxPercent: toNum(item.taxPercent),
              discount: toNum(item.discount),
            }));

        if (items && sourceItems.length === 0) {
          throw new BadRequestException(
            'A purchase order needs at least one line item.',
          );
        }

        const totals = this.computeOrderTotals(sourceItems, {
          taxPercent: updateData.taxPercent ?? toNum(po.taxPercent),
          discountAmount: updateData.discountAmount ?? toNum(po.discountAmount),
          shippingCost: updateData.shippingCost ?? toNum(po.shippingCost),
        });

        if (items) {
          await tx.purchaseOrderItem.deleteMany({
            where: { purchaseOrderId: id },
          });
          await tx.purchaseOrderItem.createMany({
            data: sourceItems.map((item: any, idx: number) => ({
              purchaseOrderId: id,
              itemName: item.itemName,
              unit: item.unit,
              uom: item.uom || 'PIECES',
              quantityOrdered: item.quantityOrdered,
              quantityReceived: 0,
              unitCost: item.unitCost,
              taxPercent: item.taxPercent,
              discount: item.discount,
              total: totals.lineTotals[idx],
              batchNumber: item.batchNumber ?? null,
              expiryDate: item.expiryDate
                ? new Date(item.expiryDate)
                : undefined,
              notes: item.notes ?? null,
              inventoryItemId: item.inventoryItemId || null,
            })),
          });
        }

        // Guarded write: still DRAFT, still the version we read. Loses the
        // race rather than clobbering a concurrent edit.
        const applied = await tx.purchaseOrder.updateMany({
          where: {
            id,
            status: PurchaseOrderStatus.DRAFT,
            version: po.version,
          },
          data: {
            ...updateData,
            subtotal: totals.subtotal,
            taxPercent: totals.taxPercent,
            taxAmount: totals.taxAmount,
            discountAmount: totals.discountAmount,
            shippingCost: totals.shippingCost,
            total: totals.total,
            balance: this.remainingBalance(
              totals.total,
              toNum(po.amountPaid),
              toNum(po.amountCredited),
            ),
            version: { increment: 1 },
          },
        });

        if (applied.count !== 1) {
          throw new ConflictException(
            'Purchase order changed while you were editing it. Reload and retry.',
          );
        }

        return tx.purchaseOrder.findUnique({
          where: { id },
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // Outstanding supplier balance. Credit notes settle the order just as cash
  // does, so they belong in the subtraction — the old `total - amountPaid`
  // overstated what was still owed on any credited order.
  private remainingBalance(
    total: number,
    amountPaid: number,
    amountCredited: number,
  ): number {
    const remaining = new Decimal(String(total))
      .minus(new Decimal(String(amountPaid)))
      .minus(new Decimal(String(amountCredited)));
    return money(Decimal.max(remaining, new Decimal(0)));
  }

  async submitPurchaseOrder(id: string, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.status !== PurchaseOrderStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT orders can be submitted');
      }
      const submitter = userId ?? po.createdById;

      // The status is re-asserted in the WHERE clause so the transition itself
      // is the thing that races, not a read taken before it. A second
      // concurrent submit matches 0 rows and is rejected instead of silently
      // re-stamping submittedAt / submittedById.
      const applied = await tx.purchaseOrder.updateMany({
        where: { id, status: PurchaseOrderStatus.DRAFT },
        data: {
          status: PurchaseOrderStatus.SUBMITTED,
          submittedById: submitter,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (applied.count !== 1) {
        throw new ConflictException(
          'Purchase order is no longer a DRAFT — it may already have been submitted.',
        );
      }

      const submitted = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
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
      if (po.status !== PurchaseOrderStatus.SUBMITTED) {
        throw new BadRequestException('Only SUBMITTED orders can be approved');
      }
      // Segregation of duties — approver cannot be the submitter or the creator.
      if (po.createdById === userId || po.submittedById === userId) {
        throw new BadRequestException(
          'Approver cannot be the same user as the submitter or creator (segregation of duties).',
        );
      }

      const applied = await tx.purchaseOrder.updateMany({
        where: { id, status: PurchaseOrderStatus.SUBMITTED },
        data: {
          status: PurchaseOrderStatus.APPROVED,
          approvedById: userId,
          approvedAt: new Date(),
          approvalNotes: dto.approvalNotes,
          version: { increment: 1 },
        },
      });
      if (applied.count !== 1) {
        throw new ConflictException(
          'Purchase order is no longer SUBMITTED — it may already have been approved.',
        );
      }

      const approved = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
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
    const CANCELLABLE: PurchaseOrderStatus[] = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.SUBMITTED,
      PurchaseOrderStatus.APPROVED,
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
    ];

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (!CANCELLABLE.includes(po.status)) {
        throw new BadRequestException(
          `Cannot cancel an order that is ${po.status}.`,
        );
      }

      const applied = await tx.purchaseOrder.updateMany({
        where: { id, status: { in: CANCELLABLE } },
        data: {
          status: PurchaseOrderStatus.CANCELLED,
          version: { increment: 1 },
        },
      });
      if (applied.count !== 1) {
        throw new ConflictException(
          'Purchase order changed before it could be cancelled. Reload and retry.',
        );
      }

      const cancelled = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
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

    // Only an approved order can be received against. The previous guard
    // blocked just CANCELLED and FULLY_RECEIVED, so stock could be taken in
    // against a DRAFT or SUBMITTED order — and calculatePurchaseOrderStatus
    // would then stamp it APPROVED with nobody having approved it.
    const RECEIVABLE: PurchaseOrderStatus[] = [
      PurchaseOrderStatus.APPROVED,
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
    ];

    return this.prisma.$transaction(
      async (tx) => {
        const po = await tx.purchaseOrder.findUnique({
          where: { id: dto.purchaseOrderId },
          include: { items: true },
        });

        if (!po) throw new NotFoundException('Purchase order not found');
        if (!RECEIVABLE.includes(po.status)) {
          throw new BadRequestException(
            `Cannot receive against a ${po.status} purchase order. ` +
              `The order must be APPROVED first.`,
          );
        }

        const location = await tx.location.findUnique({
          where: { id: dto.locationId },
          select: { id: true },
        });
        if (!location) throw new NotFoundException('Location not found');

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
            deliveryCode: await this.docNum.next('DEL', tx),
            purchaseOrderId: dto.purchaseOrderId,
            locationId: dto.locationId,
            deliveryDate: dto.deliveryDate
              ? new Date(dto.deliveryDate)
              : new Date(),
            supplierRef: dto.supplierRef,
            invoiceNumber: dto.invoiceNumber,
            notes: dto.notes,
            // Set below from what was actually accepted vs delivered. Taking
            // it from the payload let a caller mark a short delivery COMPLETE.
            status: DeliveryStatus.PENDING,
            receivedById: userId,
          },
        });

        // Running total received per PO item, seeded from the database.
        //
        // Two things forced this. First, the lines were processed with
        // Promise.all: concurrent lines for the same inventory item each read
        // the batch sum and then wrote an ABSOLUTE location quantity, so one
        // line's receipt was lost. Second, each line wrote quantityReceived as
        // an absolute computed from the `poItem` snapshot taken before the
        // loop, so two lines against the same PO item (a legitimate split
        // across batch numbers) made the second overwrite the first.
        //
        // Sequential processing fixes the first. This map fixes the second:
        // the cumulative cap is checked against it, and it is what gets
        // written, so a split delivery accumulates instead of overwriting.
        const receivedSoFar = new Map<string, Decimal>(
          po.items.map((it) => [
            it.id,
            new Decimal(it.quantityReceived.toString()),
          ]),
        );

        for (const item of dto.items) {
          await this.processDeliveryItem(tx, {
            deliveryId: delivery.id,
            item,
            poItems: po.items,
            receivedSoFar,
            locationId: dto.locationId,
            purchaseOrderId: po.id,
            userId,
          });
        }

        // Derive the delivery's own status from its lines: everything
        // accepted is COMPLETE, nothing accepted is RETURNED, anything in
        // between is PARTIAL.
        const lines = await tx.deliveryItem.findMany({
          where: { deliveryId: delivery.id },
          select: { quantityDelivered: true, quantityAccepted: true },
        });
        const delivered = lines.reduce(
          (sum, l) => sum.plus(new Decimal(l.quantityDelivered.toString())),
          new Decimal(0),
        );
        const accepted = lines.reduce(
          (sum, l) => sum.plus(new Decimal(l.quantityAccepted.toString())),
          new Decimal(0),
        );
        const deliveryStatus = accepted.lessThanOrEqualTo(
          DELIVERY_CONFIG.EPSILON,
        )
          ? DeliveryStatus.RETURNED
          : delivered.minus(accepted).lessThanOrEqualTo(DELIVERY_CONFIG.EPSILON)
            ? DeliveryStatus.COMPLETE
            : DeliveryStatus.PARTIAL;

        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: deliveryStatus },
        });

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
        timeout: 15000,
      },
    );
  }

  private async processDeliveryItem(
    tx: Prisma.TransactionClient,
    params: {
      deliveryId: string;
      item: CreateDeliveryItemDto;
      poItems: any[];
      receivedSoFar: Map<string, Decimal>;
      locationId: string;
      purchaseOrderId: string;
      userId: string;
    },
  ) {
    const {
      deliveryId,
      item,
      poItems,
      receivedSoFar,
      locationId,
      purchaseOrderId,
      userId,
    } = params;

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
    const previouslyReceived =
      receivedSoFar.get(poItem.id) ??
      new Decimal(poItem.quantityReceived.toString());
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
    receivedSoFar.set(poItem.id, newTotalReceived);

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
  /**
   * Book an accepted delivery line into stock.
   *
   * The arithmetic that used to live here — upsert the batch, re-sum the
   * location, write a ledger row with an "approximate" before/after — now
   * lives in StockMovementService, alongside the same operation as performed
   * by stock-in, transfers and adjustments. Two things changed in the move:
   * the batch's cost is blended rather than overwritten, so existing on-hand
   * is no longer revalued at the newest price; and the ledger row carries the
   * real running balance instead of an approximation.
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
      deliveryId,
      quantityAccepted,
      unitCost,
      batchNumber,
      expiryDate,
      itemUnit,
      userId,
    } = params;

    const item = await tx.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: { id: true, name: true, batchTracking: true },
    });
    if (!item) {
      throw new NotFoundException(
        `Inventory item ${inventoryItemId} not found`,
      );
    }

    const qtyNum = quantityAccepted.toNumber();

    const { batchId } = await this.movements.receive(tx, {
      itemId: inventoryItemId,
      locationId,
      quantity: qtyNum,
      unitCost,
      batchNumber,
      expiryDate,
      type: StockLedgerType.PURCHASE_RECEIPT,
      referenceType: 'DELIVERY',
      referenceId: deliveryId,
      notes: `Purchase receipt: ${qtyNum} ${itemUnit} @ ${unitCost}`,
      performedById: userId,
      links: { deliveryId },
      requireBatchDetails: item.batchTracking,
      itemName: item.name,
    });

    return batchId;
  }
  // ───────────────────────────────────────────────────────────────────────────
  // VOID A DELIVERY — takes the received stock back out and un-receives the PO
  //
  // A mis-keyed goods receipt used to be permanent: there was no void path
  // anywhere in the module, so the only remedy was a stock adjustment, which
  // left the purchase order still claiming the quantity had arrived and the
  // supplier still owed for it.
  // ───────────────────────────────────────────────────────────────────────────

  async voidDelivery(id: string, reason: string, userId: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A void reason is required.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const delivery = await tx.delivery.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!delivery) throw new NotFoundException('Delivery not found');
        if (delivery.status === DeliveryStatus.VOID) {
          throw new ConflictException(
            `Delivery ${delivery.deliveryCode} is already void.`,
          );
        }

        const claimed = await tx.delivery.updateMany({
          where: { id, status: { not: DeliveryStatus.VOID } },
          data: {
            status: DeliveryStatus.VOID,
            voidedAt: new Date(),
            voidedById: userId,
            voidReason: reason.trim(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Delivery was voided by someone else first.',
          );
        }

        // Put the stock back out. Refuses if it has already been consumed.
        await this.movements.reverseDocument(tx, {
          referenceType: 'DELIVERY',
          referenceId: id,
          reversalReferenceType: 'DELIVERY_VOID',
          reason: reason.trim(),
          performedById: userId,
          links: { deliveryId: id },
        });

        // Un-receive the purchase order lines this delivery had credited.
        for (const line of delivery.items) {
          const accepted = new Decimal(line.quantityAccepted.toString());
          if (accepted.lessThanOrEqualTo(0)) continue;

          const poItem = await tx.purchaseOrderItem.findUnique({
            where: { id: line.purchaseOrderItemId },
            select: { id: true, quantityReceived: true },
          });
          if (!poItem) continue;

          const remaining = Decimal.max(
            new Decimal(poItem.quantityReceived.toString()).minus(accepted),
            new Decimal(0),
          );
          await tx.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: { quantityReceived: remaining.toNumber() },
          });
        }

        const finalStatus = await this.calculatePurchaseOrderStatus(
          tx,
          delivery.purchaseOrderId,
        );
        await tx.purchaseOrder.update({
          where: { id: delivery.purchaseOrderId },
          data: { status: finalStatus },
        });

        await tx.auditLog.create({
          data: {
            action: 'VOID',
            module: 'PURCHASE_ORDERS',
            entityType: 'Delivery',
            recordId: id,
            oldData: delivery,
            reason: reason.trim(),
            userId,
            userName: null,
          },
        });

        return tx.delivery.findUniqueOrThrow({
          where: { id },
          include: { items: true, purchaseOrder: true, location: true },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );
  }

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
    // Nothing is outstanding against this order any more — it is back to
    // being an approved order awaiting delivery. Receiving is gated on
    // APPROVED / PARTIALLY_RECEIVED, so this can no longer promote an
    // unapproved order the way it used to.
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

  // ───────────────────────────────────────────────────────────────────────────
  // STOCK ADJUSTMENTS and WASTE RECORDS — removed from this service.
  //
  // Both lived here as a second, divergent implementation of stock mutation:
  //
  //  * createStockAdjustment wrote InventoryLocationStock.quantity directly
  //    with `{ increment: diff }` and never touched InventoryBatch. Every
  //    other path in the system treats batch rows as the truth and recomputes
  //    location stock as SUM(active batches), so the next movement of that
  //    item silently discarded the adjustment. It also applied immediately,
  //    with no approval, while StockAdjustmentService requires PENDING →
  //    APPROVED.
  //
  //  * createWasteRecord checked no availability at all, decremented location
  //    stock directly, and decremented a batch only when one happened to
  //    match — leaving the two out of step whenever it did not.
  //
  // Use the owning modules instead, both batch-aware and approval-gated:
  //
  //    POST   /adjustments          StockAdjustmentService.create
  //    PATCH  /adjustments/:id/approve
  //    GET    /adjustments
  //
  //    POST   /waste               WasteService.create
  //    PATCH  /waste/:id/approve
  //    GET    /waste
  //
  // The inventory ledger reader below stays: it is read-only and spans every
  // movement type, whatever wrote it.
  // ───────────────────────────────────────────────────────────────────────────

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
