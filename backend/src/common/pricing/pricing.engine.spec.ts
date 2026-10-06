import { PricingModel } from '@prisma/client';
import { PricingEngine, isLowerFdi, isUpperFdi } from './pricing.engine';

const cfg = (pricingModel: PricingModel) => ({
  basePrice: 100,
  baseCost: 10,
  pricingModel,
  currency: 'UGX',
});

describe('PricingEngine — PER_ARCH', () => {
  it('counts one arch per jaw touched (permanent teeth)', () => {
    expect(
      PricingEngine.calculate(cfg(PricingModel.PER_ARCH), {
        toothNumbers: [16, 26],
      }).quantity,
    ).toBe(1);
    expect(
      PricingEngine.calculate(cfg(PricingModel.PER_ARCH), {
        toothNumbers: [16, 36],
      }).quantity,
    ).toBe(2);
  });

  it('counts primary teeth in their arch', () => {
    // 55 upper primary, 75 lower primary — used to count as no arch at all.
    expect(
      PricingEngine.calculate(cfg(PricingModel.PER_ARCH), {
        toothNumbers: [55, 75],
      }).quantity,
    ).toBe(2);
  });

  it('classifies FDI quadrants', () => {
    expect([11, 28, 51, 65].every(isUpperFdi)).toBe(true);
    expect([31, 48, 71, 85].every(isLowerFdi)).toBe(true);
    expect(isUpperFdi(36)).toBe(false);
  });
});
