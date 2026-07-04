// src/billing/currency.service.ts

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  date: Date;
  source: 'manual' | 'api' | 'fixed';
}

/**
 * Single source of truth for currency conversion.
 *
 * The clinic only transacts in UGX and USD. The clinic_settings table stores
 * ONE rate under the key `EXCHANGE_RATE` which represents:
 *   1 USD = <value> UGX  (e.g. 3600).
 *
 * Conversions:
 *   USD → UGX : multiply by EXCHANGE_RATE
 *   UGX → USD : divide   by EXCHANGE_RATE
 *   same → same: 1
 *   any other pair: HARD ERROR (throws BadRequestException)
 */
export const SUPPORTED_CURRENCIES = ['UGX', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

function isSupported(c: string): c is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

@Injectable()
export class CurrencyService {
  private readonly BASE_CURRENCY: SupportedCurrency = 'UGX';
  private readonly QUOTE_CURRENCY: SupportedCurrency = 'USD';
  private readonly SETTING_KEY = 'EXCHANGE_RATE';
  private readonly FALLBACK_RATE = 3600; // used only if setting is missing/invalid

  private readonly logger = new Logger(CurrencyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Read the canonical USD→UGX rate from clinic_settings.
   * Returns the FALLBACK_RATE (with a warning) if the setting is missing or invalid.
   */
  async getUsdToUgxRate(): Promise<number> {
    const setting = await this.prisma.clinicSettings.findUnique({
      where: { key: this.SETTING_KEY },
    });

    if (!setting?.value) {
      this.logger.warn(
        `ClinicSettings.${this.SETTING_KEY} is not configured; using fallback ${this.FALLBACK_RATE}`,
      );
      return this.FALLBACK_RATE;
    }

    const rate = Number(setting.value);
    if (!Number.isFinite(rate) || rate <= 0) {
      this.logger.warn(
        `ClinicSettings.${this.SETTING_KEY}="${setting.value}" is invalid; using fallback ${this.FALLBACK_RATE}`,
      );
      return this.FALLBACK_RATE;
    }
    return rate;
  }

  /**
   * Get exchange rate between two currencies.
   * Only USD↔UGX is supported. Same-currency pairs return 1.
   * Any other pair raises BadRequestException — we refuse to silently use 1:1.
   */
  async getExchangeRate(
    from: string,
    to: string,
    _date?: Date,
  ): Promise<number> {
    const f = (from || '').toUpperCase();
    const t = (to || '').toUpperCase();

    if (!isSupported(f) || !isSupported(t)) {
      throw new BadRequestException(
        `Unsupported currency in conversion ${f}->${t}. Only UGX and USD are supported.`,
      );
    }

    if (f === t) return 1;

    const usdToUgx = await this.getUsdToUgxRate();

    if (f === 'USD' && t === 'UGX') return usdToUgx;
    // f === 'UGX' && t === 'USD'
    return 1 / usdToUgx;
  }

  /**
   * Convert amount from one currency to another.
   * If `exchangeRate` is supplied it is used as-is (and trusted to be from→to).
   * Otherwise the rate is fetched from clinic_settings.
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    exchangeRate?: number,
    date?: Date,
  ): Promise<{ amount: number; rate: number; from: string; to: string }> {
    const rate =
      exchangeRate ??
      (await this.getExchangeRate(fromCurrency, toCurrency, date));

    return {
      amount: Math.round(amount * rate * 100) / 100,
      rate,
      from: fromCurrency,
      to: toCurrency,
    };
  }

  /**
   * Format amount for display with currency symbol.
   * Only UGX and USD are supported (other currencies fall back to the code).
   */
  formatAmount(amount: number | { toNumber?: () => number } | null | undefined, currency: string): string {
    const num =
      amount == null
        ? 0
        : typeof amount === 'number'
          ? amount
          : typeof (amount as any).toNumber === 'function'
            ? (amount as any).toNumber()
            : Number(amount);

    if (currency === 'UGX') {
      return `USh ${Math.round(num).toLocaleString('en-UG')}`;
    }
    if (currency === 'USD') {
      return `$ ${num.toLocaleString('en-UG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    // Unknown currency — render the code instead of guessing a symbol
    return `${currency} ${num.toLocaleString('en-UG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  getBaseCurrency(): string {
    return this.BASE_CURRENCY;
  }

  /**
   * Write a new rate to clinic_settings.EXCHANGE_RATE.
   * The caller may specify the pair as (USD, UGX) for the canonical rate, or
   * (UGX, USD) for the inverse — it is normalized to USD→UGX before saving.
   * Any other pair is rejected.
   */
  async setExchangeRate(
    from: string,
    to: string,
    rate: number,
    source: string = 'manual',
  ) {
    const f = (from || '').toUpperCase();
    const t = (to || '').toUpperCase();

    let usdToUgx: number;
    if (f === 'USD' && t === 'UGX') {
      usdToUgx = rate;
    } else if (f === 'UGX' && t === 'USD') {
      if (!rate || rate <= 0) {
        throw new Error('Invalid rate for UGX->USD');
      }
      usdToUgx = 1 / rate;
    } else {
      throw new Error(
        `Cannot store rate for ${f}->${t}: only USD<->UGX is supported via clinic_settings.${this.SETTING_KEY}`,
      );
    }

    if (!Number.isFinite(usdToUgx) || usdToUgx <= 0) {
      throw new Error(`Invalid USD->UGX rate: ${usdToUgx}`);
    }

    await this.prisma.clinicSettings.upsert({
      where: { key: this.SETTING_KEY },
      update: {
        value: String(usdToUgx),
        description: `Exchange rate 1 USD = ${usdToUgx} UGX (${source})`,
      },
      create: {
        key: this.SETTING_KEY,
        value: String(usdToUgx),
        description: `Exchange rate 1 USD = ${usdToUgx} UGX (${source})`,
      },
    });
  }
}
