// src/constants/currency.ts
export const BASE_CURRENCY = 'UGX';

export const CURRENCY_CONFIG: Record<string, { symbol: string; decimals: number; name: string }> = {
  'UGX': { symbol: 'UGX', decimals: 0, name: 'Uganda Shilling' },
  'USD': { symbol: 'USD', decimals: 2, name: 'US Dollar' },
};

export function formatCurrency(amount: number, currency: string): string {
  const config = CURRENCY_CONFIG[currency] || { symbol: currency, decimals: 2 };
  const formatted = amount.toLocaleString('en-UG', {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });
  return `${config.symbol} ${formatted}`;
}