// src/treatment-plans/procedure-collections.ts
// ─────────────────────────────────────────────────────────────────────────────
// What has been billed and collected for each treatment procedure.
//
// Payments are recorded against invoices, never against procedures, so
// TreatmentProcedure.amountPaid / paymentStatus were never updated and every
// report showed 0 collected. The figure is derived here instead: a procedure's
// share of each invoice payment is its line's share of the invoice
// (pro-rata, in the clinic base currency), capped at the line itself.
// ─────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client';

export interface ProcedureCollection {
  /** Base-currency value of the procedure's ACTIVE invoice line(s). */
  billedBase: number;
  /** Base-currency share of the payments on those invoices. */
  paidBase: number;
}

type Db = Pick<Prisma.TransactionClient, 'invoiceItem'>;

const n = (v: unknown) => (v == null ? 0 : Number(v));

/** Pure allocation — exported for tests. */
export function allocateCollections(
  items: Array<{
    treatmentProcedureId: string | null;
    originalTotal: unknown;
    total: unknown;
    exchangeRate: unknown;
    invoice: { baseSubtotal: unknown; baseAmountPaid: unknown };
  }>,
): Map<string, ProcedureCollection> {
  const out = new Map<string, ProcedureCollection>();
  for (const it of items) {
    if (!it.treatmentProcedureId) continue;
    // Same base figure invoice recalc uses: COALESCE(originalTotal, total) × rate.
    const itemBase =
      n(it.originalTotal ?? it.total) * (n(it.exchangeRate) || 1);
    const subtotal = n(it.invoice.baseSubtotal);
    const paid = n(it.invoice.baseAmountPaid);
    const share = subtotal > 0 ? itemBase / subtotal : 0;
    const paidBase = Math.max(0, Math.min(itemBase, paid * share));
    const agg = out.get(it.treatmentProcedureId) ?? {
      billedBase: 0,
      paidBase: 0,
    };
    agg.billedBase += itemBase;
    agg.paidBase += paidBase;
    out.set(it.treatmentProcedureId, agg);
  }
  for (const v of out.values()) {
    v.billedBase = Math.round(v.billedBase * 100) / 100;
    v.paidBase = Math.round(v.paidBase * 100) / 100;
  }
  return out;
}

export async function collectionsByProcedure(
  db: Db,
  treatmentProcedureIds: string[],
): Promise<Map<string, ProcedureCollection>> {
  const ids = [...new Set(treatmentProcedureIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const items =
    (await db.invoiceItem.findMany({
      where: {
        treatmentProcedureId: { in: ids },
        status: 'ACTIVE',
        invoice: { status: { not: 'VOID' }, deletedAt: null },
      },
      select: {
        treatmentProcedureId: true,
        originalTotal: true,
        total: true,
        exchangeRate: true,
        invoice: { select: { baseSubtotal: true, baseAmountPaid: true } },
      },
    })) ?? [];
  return allocateCollections(items);
}

/** Payment status of one procedure from its collection. */
export function collectionStatus(
  c: ProcedureCollection | undefined,
): 'OPEN' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  if (!c || c.billedBase <= 0) return 'OPEN';
  if (c.paidBase <= 0) return 'UNPAID';
  if (c.paidBase + 0.01 >= c.billedBase) return 'PAID';
  return 'PARTIALLY_PAID';
}
