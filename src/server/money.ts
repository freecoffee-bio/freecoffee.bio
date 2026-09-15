import Big from 'big.js';

export const SUPPORTED_CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_DECIMALS: Record<Currency, number> = {
  USD: 2,
  CNY: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

export const ROUNDING_MODE = Big.roundHalfUp;

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

function assertCurrency(currency: string): asserts currency is Currency {
  if (!isCurrency(currency)) throw new Error('Unsupported currency.');
}

function decimalPlaces(currency: string): number {
  assertCurrency(currency);
  return CURRENCY_DECIMALS[currency];
}

export function amountToMinor(amount: string, currency: string): number {
  const decimals = decimalPlaces(currency);
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(amount.trim())) throw new Error('Invalid amount.');
  const value = new Big(amount.trim());
  if (value.lt(0) || !value.c) throw new Error('Amount must be non-negative.');
  const minor = value.times(new Big(10).pow(decimals)).round(0, ROUNDING_MODE);
  const result = minor.toFixed(0);
  if (result.length > 15) throw new Error('Amount is too large.');
  return Number.parseInt(result, 10);
}

export function minorToAmount(minor: number, currency: string): string {
  const decimals = decimalPlaces(currency);
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('Invalid minor amount.');
  return new Big(minor).div(new Big(10).pow(decimals)).toFixed(decimals);
}

export function convertMinor(minor: number, from: string, to: string, rate: string): number {
  const amount = minorToAmount(minor, from);
  const converted = new Big(amount).times(new Big(rate));
  return amountToMinor(converted.toFixed(), to);
}

export function calculateTax(subtotalMinor: number, taxRateBasisPoints: number, currency: string): number {
  decimalPlaces(currency);
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new Error('Invalid subtotal.');
  if (!Number.isSafeInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 10000) throw new Error('Invalid tax rate.');
  const taxMinor = new Big(subtotalMinor).times(taxRateBasisPoints).div(10000).round(0, ROUNDING_MODE).toFixed(0);
  return Number.parseInt(taxMinor, 10);
}

export function formatMoney(minor: number, currency: string): string {
  return `${minorToAmount(minor, currency)} ${currency}`;
}
