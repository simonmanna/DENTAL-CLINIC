// A prescribed drug leaves stock exactly once.
//
// Two events used to deduct it: posting the invoice that carries the line,
// and pressing Dispense. Each did so through its own hand-rolled copy of the
// stock arithmetic, so a prescription that was both billed and dispensed left
// stock twice, and voiding the invoice put stock back into the location total
// only — where the next movement, which re-derives that total from the batch
// rows, quietly took it out again.
//
// The rule now: whichever of the two happens first issues the line's stock
// through StockMovementService (batch draw, expiry check, batch cost), and the
// other finds it already issued and moves nothing. Voiding the invoice gives
// the stock back only while the drugs have not been handed over.
//
// The ledger rows for one prescription line are that line's "document"
// (referenceType PRESCRIPTION_ITEM, referenceId = line id), so "already
// issued" is simply "has rows in effect".
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrescriptionStatus, StockLedgerType } from '@prisma/client';
import { StockMovementService } from './stock-movement.service';

/** Ledger reference for stock issued against one prescription line. */
export const RX_LINE_REF = 'PRESCRIPTION_ITEM';
/** Ledger reference for stock given back for a prescription line. */
export const RX_LINE_RETURN_REF = 'PRESCRIPTION_ITEM_RETURN';

export type RxIssueOutcome = 'issued' | 'already-issued' | 'not-stocked';

@Injectable()
export class PrescriptionStockService {
  constructor(private readonly movements: StockMovementService) {}

  /**
   * Issue a prescription line's stock unless it has already left stock.
   *
   * `not-stocked` means the drug is not linked to an inventory item, so there
   * is nothing to move; callers decide whether that is acceptable.
   */
  async issueOnce(
    tx: Prisma.TransactionClient,
    params: {
      prescriptionItemId: string;
      quantity: number;
      locationId: string;
      notes: string;
      performedById?: string | null;
    },
  ): Promise<RxIssueOutcome> {
    const line = await this.loadLine(tx, params.prescriptionItemId);
    const itemId = line.drug?.inventoryItemId;
    if (!itemId) return 'not-stocked';

    if (await this.isIssued(tx, line, itemId)) return 'already-issued';

    await this.movements.issue(tx, {
      itemId,
      locationId: params.locationId,
      quantity: params.quantity,
      strategy: 'FEFO',
      type: StockLedgerType.SALE,
      referenceType: RX_LINE_REF,
      referenceId: line.id,
      notes: params.notes,
      performedById: params.performedById ?? null,
      itemName: line.drug?.name,
    });
    return 'issued';
  }

  /**
   * Give back a line's stock when the invoice carrying it is voided — unless
   * the drugs were already handed to the patient, in which case they are gone
   * and the stock stays out.
   *
   * `invoiceId` also reverses what the pre-rule invoice path deducted for this
   * line (rows referenced to the invoice rather than the line).
   */
  async returnIfNotDispensed(
    tx: Prisma.TransactionClient,
    params: {
      prescriptionItemId: string;
      invoiceId: string;
      reason: string;
      performedById?: string | null;
    },
  ): Promise<{ returned: number }> {
    const line = await this.loadLine(tx, params.prescriptionItemId);
    const itemId = line.drug?.inventoryItemId;
    if (!itemId) return { returned: 0 };
    if (line.prescription.status === PrescriptionStatus.DISPENSED) {
      return { returned: 0 };
    }

    const current = await this.movements.reverseOutstanding(tx, {
      referenceType: RX_LINE_REF,
      referenceId: line.id,
      reversalReferenceType: RX_LINE_RETURN_REF,
      reason: params.reason,
      performedById: params.performedById,
    });
    const legacy = await this.movements.reverseOutstanding(tx, {
      referenceType: 'INVOICE',
      referenceId: params.invoiceId,
      itemId,
      reversalReferenceType: 'INVOICE_VOID',
      reason: params.reason,
      performedById: params.performedById,
    });
    return { returned: current.reversed + legacy.reversed };
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async loadLine(tx: Prisma.TransactionClient, id: string) {
    const line = await tx.prescriptionItem.findUnique({
      where: { id },
      select: {
        id: true,
        prescriptionId: true,
        prescription: { select: { status: true } },
        drug: { select: { name: true, inventoryItemId: true } },
      },
    });
    if (!line) throw new NotFoundException(`Prescription line ${id} not found`);
    return line;
  }

  /**
   * Whether the line's stock is out right now: rows under this rule still in
   * effect, or a deduction made before the rule existed.
   */
  private async isIssued(
    tx: Prisma.TransactionClient,
    line: { id: string; prescriptionId: string; prescription: { status: PrescriptionStatus } },
    itemId: string,
  ): Promise<boolean> {
    const inEffect = (where: Prisma.InventoryLedgerWhereInput) =>
      tx.inventoryLedger.findFirst({
        where: { ...where, reversalOfId: null, reversedBy: { is: null } },
        select: { id: true },
      });

    if (await inEffect({ referenceType: RX_LINE_REF, referenceId: line.id })) {
      return true;
    }

    const everUnderRule = await tx.inventoryLedger.findFirst({
      where: { referenceType: RX_LINE_REF, referenceId: line.id },
      select: { id: true },
    });
    if (everUnderRule) return false; // issued and given back since

    // Before the rule: the old dispense deducted the whole prescription
    // (referenced to the prescription), and the old invoice posting deducted
    // per invoice. Either one means this line's stock already left.
    if (
      line.prescription.status === PrescriptionStatus.DISPENSED &&
      (await tx.inventoryLedger.findFirst({
        where: {
          referenceType: 'PRESCRIPTION_DISPENSE',
          referenceId: line.prescriptionId,
          itemId,
        },
        select: { id: true },
      }))
    ) {
      return true;
    }

    const invoices = await tx.invoiceItem.findMany({
      where: { prescriptionItemId: line.id },
      select: { invoiceId: true },
    });
    for (const { invoiceId } of invoices) {
      if (await inEffect({ referenceType: 'INVOICE', referenceId: invoiceId, itemId })) {
        return true;
      }
    }
    return false;
  }
}
