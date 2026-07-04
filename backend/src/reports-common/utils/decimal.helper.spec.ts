import { toNum, sumField, fmtMoney, pct } from './decimal.helper';

describe('toNum', () => {
  it('returns 0 for null and undefined', () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
  });

  it('returns the number unchanged when finite', () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(0)).toBe(0);
    expect(toNum(-1.5)).toBe(-1.5);
  });

  it('returns 0 for non-finite numbers', () => {
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
  });

  it('calls toNumber on Prisma.Decimal-like objects', () => {
    const fakeDecimal = { toNumber: () => 123.45 };
    expect(toNum(fakeDecimal)).toBe(123.45);
  });

  it('parses numeric strings', () => {
    expect(toNum('99.5')).toBe(99.5);
    expect(toNum('not-a-number')).toBe(0);
  });
});

describe('sumField', () => {
  it('sums a field across rows', () => {
    const rows = [{ amount: 10 }, { amount: 20 }, { amount: 30 }];
    expect(sumField(rows, (r) => r.amount)).toBe(60);
  });

  it('handles null and undefined values', () => {
    const rows = [{ amount: 10 }, { amount: null }, { amount: undefined }];
    expect(sumField(rows, (r) => r.amount)).toBe(10);
  });

  it('returns 0 for empty array', () => {
    expect(sumField([], (r: any) => r.amount)).toBe(0);
  });
});

describe('fmtMoney', () => {
  it('formats whole numbers with thousand separators', () => {
    expect(fmtMoney(1234567)).toBe('1,234,567 UGX');
    expect(fmtMoney(0)).toBe('0 UGX');
  });

  it('formats decimals with 2 dp', () => {
    expect(fmtMoney(1234.5)).toBe('1,234.50 UGX');
    expect(fmtMoney(1234.567)).toBe('1,234.57 UGX');
  });

  it('omits currency when not provided', () => {
    expect(fmtMoney(100, '')).toBe('100');
  });
});

describe('pct', () => {
  it('computes percentage to 1 decimal', () => {
    expect(pct(7, 10)).toBe(70);
    expect(pct(1, 3)).toBe(33.3);
  });

  it('returns 0 for divide-by-zero', () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(5, -1)).toBe(0);
  });

  it('handles NaN inputs', () => {
    expect(pct(NaN, 10)).toBe(0);
    expect(pct(5, NaN)).toBe(0);
  });
});