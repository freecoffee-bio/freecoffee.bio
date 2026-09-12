import type { Currency } from './money';

export const FIAT_PAYMENT_PROVIDERS = ['stripe', 'paypal'] as const;
export type FiatPaymentProvider = typeof FIAT_PAYMENT_PROVIDERS[number];

export const FIAT_PROVIDER_CURRENCIES: Record<FiatPaymentProvider, readonly Currency[]> = {
  stripe: ['USD', 'CNY', 'EUR', 'GBP', 'JPY'],
  paypal: ['USD', 'CNY', 'EUR', 'GBP', 'JPY'],
};

export function isFiatPaymentProvider(value: unknown): value is FiatPaymentProvider {
  return value === 'stripe' || value === 'paypal';
}

export function supportsFiatProviderCurrency(provider: FiatPaymentProvider, currency: Currency): boolean {
  return FIAT_PROVIDER_CURRENCIES[provider].includes(currency);
}
