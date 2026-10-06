import { allocateCollections, collectionStatus } from './procedure-collections';

const item = (
  tp: string,
  base: number,
  inv: { sub: number; paid: number },
) => ({
  treatmentProcedureId: tp,
  originalTotal: base,
  total: base,
  exchangeRate: 1,
  invoice: { baseSubtotal: inv.sub, baseAmountPaid: inv.paid },
});

describe('allocateCollections', () => {
  it('splits an invoice payment pro-rata across its procedure lines', () => {
    const inv = { sub: 400, paid: 200 };
    const m = allocateCollections([item('a', 300, inv), item('b', 100, inv)]);
    expect(m.get('a')).toEqual({ billedBase: 300, paidBase: 150 });
    expect(m.get('b')).toEqual({ billedBase: 100, paidBase: 50 });
  });

  it('converts foreign lines to base and caps paid at the line value', () => {
    const m = allocateCollections([
      {
        treatmentProcedureId: 'usd',
        originalTotal: 100,
        total: 100,
        exchangeRate: 3700,
        invoice: { baseSubtotal: 370000, baseAmountPaid: 500000 },
      },
    ]);
    expect(m.get('usd')).toEqual({ billedBase: 370000, paidBase: 370000 });
  });

  it('derives a payment status', () => {
    expect(collectionStatus(undefined)).toBe('OPEN');
    expect(collectionStatus({ billedBase: 100, paidBase: 0 })).toBe('UNPAID');
    expect(collectionStatus({ billedBase: 100, paidBase: 40 })).toBe(
      'PARTIALLY_PAID',
    );
    expect(collectionStatus({ billedBase: 100, paidBase: 100 })).toBe('PAID');
  });
});
