// H5: money arithmetic is the foundation every invoice/payment/receipt total
// rests on. These pure tests lock in Decimal precision + banker's rounding so a
// future refactor can't silently reintroduce float drift.
import { M } from './money';

describe('M (money arithmetic)', () => {
  describe('no float drift', () => {
    it('0.1 + 0.2 === 0.30 (not 0.30000000000000004)', () => {
      expect(M.str(M.add('0.1', '0.2'))).toBe('0.30');
    });

    it('sums a list at full precision then rounds once', () => {
      expect(M.str(M.money(M.sum(['0.1', '0.2', '0.3'])))).toBe('0.60');
    });

    it('chains mul/sub without drift (FX projection)', () => {
      // 19.99 USD * 3750 = 74962.50 UGX
      expect(M.str(M.money(M.mul('19.99', '3750')))).toBe('74962.50');
    });
  });

  describe("money() — banker's rounding (ROUND_HALF_EVEN, 2dp)", () => {
    it.each([
      ['2.005', '2.00'], // half → down to even (0)
      ['2.015', '2.02'], // half → up to even (2)
      ['2.025', '2.02'], // half → down to even (2)
      ['2.035', '2.04'], // half → up to even (4)
      ['1.234', '1.23'], // < half rounds down
      ['1.236', '1.24'], // > half rounds up
    ])('rounds %s → %s', (input, expected) => {
      expect(M.str(M.money(input))).toBe(expected);
    });
  });

  describe('applyPct', () => {
    it('18.5% of 100 = 18.50', () => {
      expect(M.str(M.money(M.applyPct('100', '18.5')))).toBe('18.50');
    });
    it('0% of anything = 0.00', () => {
      expect(M.str(M.money(M.applyPct('1234.56', '0')))).toBe('0.00');
    });
  });

  describe('div + money', () => {
    it('1 / 3 rounds to 0.33', () => {
      expect(M.str(M.money(M.div('1', '3')))).toBe('0.33');
    });
    it('2 / 3 rounds to 0.67', () => {
      expect(M.str(M.money(M.div('2', '3')))).toBe('0.67');
    });
  });

  describe('comparisons & guards', () => {
    it('gt / lte / gte behave as expected on equal values', () => {
      expect(M.gt('100', '100')).toBe(false);
      expect(M.gte('100', '100')).toBe(true);
      expect(M.lte('100', '100')).toBe(true);
      expect(M.gt('100.01', '100')).toBe(true);
    });

    it('overpayment tolerance: balance + 0.01 boundary', () => {
      // payment exactly at balance + tolerance is NOT an overpayment
      expect(M.gt('100.01', M.add('100', '0.01'))).toBe(false);
      // a cent past tolerance IS
      expect(M.gt('100.02', M.add('100', '0.01'))).toBe(true);
    });

    it('isZero / isPositive / isNegative', () => {
      expect(M.isZero('0')).toBe(true);
      expect(M.isZero('0.00')).toBe(true);
      // decimal.js treats signed-zero as positive, so isPositive(0) === true.
      // This is exactly why money-handling code uses M.gt(x, 0) (not
      // isPositive) for the "strictly greater than zero" test — pin it here so
      // the convention can't regress.
      expect(M.isPositive('0')).toBe(true);
      expect(M.gt('0', 0)).toBe(false);
      expect(M.isPositive('0.01')).toBe(true);
      expect(M.isNegative('-0.01')).toBe(true);
    });

    it('max / min', () => {
      expect(M.str(M.max('-5', '0'))).toBe('0.00');
      expect(M.str(M.min('10', '3'))).toBe('3.00');
    });
  });

  describe('str() — JSON-safe 2dp', () => {
    it('always emits exactly 2 decimals', () => {
      expect(M.str('5')).toBe('5.00');
      expect(M.str('5.1')).toBe('5.10');
      expect(M.str(0)).toBe('0.00');
      expect(M.str(null)).toBe('0.00');
      expect(M.str(undefined)).toBe('0.00');
    });
  });
});
