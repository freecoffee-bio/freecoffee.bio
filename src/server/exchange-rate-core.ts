import Big from 'big.js';

export const EXCHANGE_RATE_SOURCE = 'open.er-api.com';
export const EXCHANGE_RATE_SYNC_INTERVAL_MS = 60 * 60_000;
export const EXCHANGE_RATE_MAX_AGE_MS = 48 * 60 * 60_000;
export const STABLECOIN_INCREMENT_UNITS = 1_000;
export const DEFAULT_EXCHANGE_RATE_API_URL = 'https://open.er-api.com/v6/latest/USD';

export function validateExchangeRateApiUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid exchange rate API URL.'); }
  if (url.protocol !== 'https:') throw new Error('Exchange rate API URL must use HTTPS.');
  if (url.username || url.password) throw new Error('Exchange rate API URL must not contain credentials.');
  return url.toString();
}

const REQUIRED_RATES = ['CNY', 'EUR', 'GBP', 'JPY'] as const;

export type AutomaticExchangeRates = Record<(typeof REQUIRED_RATES)[number], string>;

export function parseExchangeRateResponse(value: unknown, now = new Date()): { rates: AutomaticExchangeRates; effectiveAt: Date } {
  if (!value || typeof value !== 'object') throw new Error('Exchange rate service returned an invalid response.');
  const response = value as { result?: unknown; rates?: unknown; time_last_update_unix?: unknown };
  if (response.result !== 'success' || !response.rates || typeof response.rates !== 'object') throw new Error('Exchange rate service returned an invalid response.');
  const sourceRates = response.rates as Record<string, unknown>;
  const rates = Object.fromEntries(REQUIRED_RATES.map((currency) => {
    const rate = sourceRates[currency];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error(`Exchange rate service did not return a valid ${currency} rate.`);
    return [currency, new Big(rate).toFixed()];
  })) as AutomaticExchangeRates;
  const timestamp = Number(response.time_last_update_unix);
  const effectiveAt = new Date(timestamp * 1_000);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || Number.isNaN(effectiveAt.getTime())) throw new Error('Exchange rate service did not return a valid update time.');
  if (effectiveAt.getTime() < now.getTime() - EXCHANGE_RATE_MAX_AGE_MS || effectiveAt.getTime() > now.getTime() + 5 * 60_000) throw new Error('Exchange rate service returned a stale update time.');
  return { rates, effectiveAt };
}

export function stablecoinQuoteFromUsdRate(minor: number, currencyDecimals: number, usdToCurrencyRate: string) {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error('Invalid payment amount.');
  const rate = new Big(usdToCurrencyRate);
  if (rate.lte(0)) throw new Error('Invalid exchange rate.');
  const usdMajor = new Big(minor).div(new Big(10).pow(currencyDecimals)).div(rate);
  const settlementAmount = Number.parseInt(usdMajor.times(100).round(0, Big.roundHalfUp).toFixed(0), 10);
  const basePaymentAmount = Number.parseInt(
    usdMajor.times(1_000_000).div(STABLECOIN_INCREMENT_UNITS).round(0, Big.roundUp).times(STABLECOIN_INCREMENT_UNITS).toFixed(0),
    10,
  );
  if (!Number.isSafeInteger(settlementAmount) || !Number.isSafeInteger(basePaymentAmount) || basePaymentAmount <= 0) throw new Error('Unable to calculate the stablecoin payment amount.');
  return { settlementAmount, basePaymentAmount };
}
