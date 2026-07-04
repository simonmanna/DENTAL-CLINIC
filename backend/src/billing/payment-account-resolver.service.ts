// src/billing/payment-account-resolver.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod } from '@prisma/client';

/**
 * Maps PaymentMethod → the Account that money flows into.
 *
 * Resolution order (first match wins):
 *   1. Exact method-to-type match in DB (e.g. CASH → AccountType.CASH)
 *   2. Currency-aware fallback (e.g. USD payment → USD bank account)
 *   3. System default account (isDefault = true)
 */

const METHOD_TO_ACCOUNT_TYPE: Record<string, string> = {
  CASH:             'CASH',
  MTN_MOBILE_MONEY: 'MOBILE_MONEY',
  AIRTEL_MONEY:     'MOBILE_MONEY',
  VISA_CARD:        'BANK',
  MASTERCARD:       'BANK',
  BANK_TRANSFER:    'BANK',
  CHEQUE:           'BANK',
  INSURANCE:        'BANK',   // Insurance settlements land in bank
};

/**
 * Optional: if you want VISA vs MASTERCARD vs BANK_TRANSFER to go to
 * different named accounts, store a "preferredAccountId" per method
 * in ClinicSettings and extend this service to look it up.
 */

@Injectable()
export class PaymentAccountResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the best account for a given payment method + currency.
   * Returns null if no suitable account found (caller should handle gracefully).
   */
  async resolve(
    method: PaymentMethod | string,
    currency = 'UGX',
  ): Promise<{ id: string; name: string; currency: string } | null> {
    const targetType = METHOD_TO_ACCOUNT_TYPE[method] ?? 'BANK';

    // 1. Try: correct type AND correct currency
    const exact = await this.prisma.account.findFirst({
      where: { type: targetType as any, currency: currency as any, isActive: true },
      select: { id: true, name: true, currency: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (exact) return exact;

    // 2. Try: correct type, any currency (still better than random account)
    const byType = await this.prisma.account.findFirst({
      where: { type: targetType as any, isActive: true },
      select: { id: true, name: true, currency: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (byType) return byType;

    // 3. Fallback: system default account
    const defaultAcc = await this.prisma.account.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true, name: true, currency: true },
    });
    return defaultAcc ?? null;
  }
}