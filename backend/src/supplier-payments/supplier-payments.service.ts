import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupplierPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(params: { supplierId?: string; purchaseOrderId?: string; page?: string }) {
    const where: any = { purchaseOrderId: { not: null } };
    if (params.supplierId) {
      where.purchaseOrder = { supplierId: params.supplierId };
    }
    if (params.purchaseOrderId) {
      where.purchaseOrderId = params.purchaseOrderId;
    }

    const pageNum = Math.max(1, parseInt(params.page || '1'));
    const pageSize = 20;
    const skip = (pageNum - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          purchaseOrder: {
            include: { supplier: true },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async create(dto: {
    supplierId: string;
    purchaseOrderId?: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    paidAt?: string;
  }) {
    const { nanoid } = await import('nanoid');
    const paymentCode = `SPP-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;

    return this.prisma.payment.create({
      data: {
        paymentCode,
        type: 'PURCHASE_ORDER',
        direction: 'OUT',
        purchaseOrderId: dto.purchaseOrderId || null,
        amount: dto.amount,
        method: dto.method as any,
        status: 'COMPLETED',
        reference: dto.reference,
        notes: dto.notes,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        currency: 'UGX',
        exchangeRate: 1,
        baseAmount: dto.amount,
      },
      include: {
        purchaseOrder: { include: { supplier: true } },
      },
    });
  }

  async getBalance(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: { supplierId },
      select: {
        id: true,
        poNumber: true,
        total: true,
        amountPaid: true,
        status: true,
        balance: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalPurchased = purchaseOrders.reduce((s, po) => s + Number(po.total), 0);
    const totalPaid = purchaseOrders.reduce((s, po) => s + Number(po.amountPaid), 0);
    const outstanding = purchaseOrders.reduce((s, po) => s + Number(po.balance), 0);

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      totalPurchased,
      totalPaid,
      outstanding,
      purchaseOrders: purchaseOrders.map((po) => ({
        id: po.id,
        orderNumber: po.poNumber,
        totalCost: Number(po.total),
        amountPaid: Number(po.amountPaid),
        status: po.status,
      })),
    };
  }

  async getStats() {
    const payments = await this.prisma.payment.findMany({
      where: { purchaseOrderId: { not: null }, status: 'COMPLETED' },
      select: { amount: true, method: true },
    });

    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const byMethod: Record<string, number> = {};
    for (const p of payments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }

    return { totalPaid, byMethod };
  }
}