// Totals arithmetic for a purchase order.
//
// The arithmetic these cover used to be wrong in a way that quietly inflated
// every taxed order: per-line tax was folded into `subtotal`, and then the
// header taxPercent was applied to that already-taxed subtotal — tax charged
// on tax. The figures below are small enough to check by hand, which is the
// point: this is the file that should fail if the tax basis ever doubles up
// again.
import { PurchaseService } from './purchase.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';
import { BadRequestException } from '@nestjs/common';

function totals(items: any[], header: any) {
  const svc = new PurchaseService(
    createPrismaMock() as any,
    createAutoMock() as any,
    createAutoMock() as any,
    createAutoMock(),
  );
  return (svc as any).computeOrderTotals(items, header);
}

describe('PurchaseService.computeOrderTotals', () => {
  it('charges line tax on the line net and does NOT also apply header tax', () => {
    // 10 @ 100 = 1000, 18% line VAT = 180.
    // A header taxPercent of 18 is present too; it must be ignored, not
    // compounded onto the 1180 the old code would have produced
    // (1000 + 180 = 1180 "subtotal", then 1180 * 0.18 = 212.40 more).
    const t = totals(
      [{ quantityOrdered: 10, unitCost: 100, taxPercent: 18, discount: 0 }],
      { taxPercent: 18, discountAmount: 0, shippingCost: 0 },
    );

    expect(t.subtotal).toBe(1000);
    expect(t.taxAmount).toBe(180);
    expect(t.total).toBe(1180);
  });

  it('applies header tax when no line carries a rate', () => {
    const t = totals(
      [{ quantityOrdered: 4, unitCost: 250, taxPercent: 0, discount: 0 }],
      { taxPercent: 18, discountAmount: 0, shippingCost: 0 },
    );

    expect(t.subtotal).toBe(1000);
    expect(t.taxAmount).toBe(180);
    expect(t.total).toBe(1180);
  });

  it('taxes the line NET of its own discount', () => {
    // 1000 gross - 100 discount = 900 net; 10% of 900 = 90, not 100.
    const t = totals(
      [{ quantityOrdered: 10, unitCost: 100, taxPercent: 10, discount: 100 }],
      {},
    );

    expect(t.subtotal).toBe(900);
    expect(t.taxAmount).toBe(90);
    expect(t.total).toBe(990);
  });

  it('subtracts the header discount once and adds shipping after tax', () => {
    const t = totals(
      [{ quantityOrdered: 1, unitCost: 1000, taxPercent: 0, discount: 0 }],
      { taxPercent: 10, discountAmount: 50, shippingCost: 25 },
    );

    expect(t.subtotal).toBe(1000);
    expect(t.taxAmount).toBe(100);
    // 1000 + 100 - 50 + 25
    expect(t.total).toBe(1075);
  });

  it('reports a blended header rate when the tax came from the lines', () => {
    // 1000 @ 18% + 1000 @ 0% = 180 tax on a 2000 subtotal -> 9%.
    const t = totals(
      [
        { quantityOrdered: 1, unitCost: 1000, taxPercent: 18, discount: 0 },
        { quantityOrdered: 1, unitCost: 1000, taxPercent: 0, discount: 0 },
      ],
      { taxPercent: 0 },
    );

    expect(t.subtotal).toBe(2000);
    expect(t.taxAmount).toBe(180);
    expect(t.taxPercent).toBe(9);
    expect(t.total).toBe(2180);
  });

  it('returns per-line totals that sum to subtotal + tax', () => {
    const t = totals(
      [
        { quantityOrdered: 3, unitCost: 100, taxPercent: 18, discount: 0 },
        { quantityOrdered: 2, unitCost: 50, taxPercent: 18, discount: 10 },
      ],
      {},
    );

    const sum = t.lineTotals.reduce((a: number, b: number) => a + b, 0);
    expect(sum).toBeCloseTo(t.subtotal + t.taxAmount, 2);
  });

  it('rounds money to 2dp rather than leaving binary float noise', () => {
    // 0.1 * 3 is 0.30000000000000004 in float arithmetic.
    const t = totals(
      [{ quantityOrdered: 3, unitCost: 0.1, taxPercent: 0, discount: 0 }],
      {},
    );

    expect(t.subtotal).toBe(0.3);
    expect(t.total).toBe(0.3);
  });

  it('rejects a discount large enough to drive the total negative', () => {
    expect(() =>
      totals(
        [{ quantityOrdered: 1, unitCost: 100, taxPercent: 0, discount: 0 }],
        { discountAmount: 500 },
      ),
    ).toThrow(BadRequestException);
  });

  it('treats an empty order as zero rather than throwing', () => {
    const t = totals([], { taxPercent: 18 });
    expect(t.subtotal).toBe(0);
    expect(t.taxAmount).toBe(0);
    expect(t.total).toBe(0);
  });
});
