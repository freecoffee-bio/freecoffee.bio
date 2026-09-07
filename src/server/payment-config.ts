import { z } from 'zod';

const providerConfigSchema = z.object({
  credentials: z.record(z.string(), z.string()).default({}),
  options: z.record(z.string(), z.unknown()).default({}),
});

const paymentProvidersSchema = z.record(z.string(), providerConfigSchema);
export type PaymentProviderConfig = z.infer<typeof providerConfigSchema>;
export type PaymentProviders = Record<string, PaymentProviderConfig>;

export function parsePaymentProviders(value: string | null | undefined): PaymentProviders {
  try {
    const parsed = paymentProvidersSchema.safeParse(JSON.parse(value || '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function getPaymentProviderConfig(settings: { paymentProviders: string }, provider: string): PaymentProviderConfig {
  return parsePaymentProviders(settings.paymentProviders)[provider] ?? { credentials: {}, options: {} };
}

export function validatePaymentCredentials(credentials: Record<string, string>) {
  const values = Object.entries(credentials);
  if (!values.length || values.some(([key, value]) => !key.trim() || !value.trim())) {
    throw new Error('Payment provider credentials cannot be empty.');
  }
  return Object.fromEntries(values.map(([key, value]) => [key.trim(), value.trim()]));
}

export function mergePaymentProviderConfig(
  existingJson: string | null | undefined,
  provider: string,
  credentials: Record<string, string>,
  options?: Record<string, unknown>,
): string {
  const providers = parsePaymentProviders(existingJson);
  const validatedCredentials = validatePaymentCredentials(credentials);
  providers[provider] = providerConfigSchema.parse({
    credentials: validatedCredentials,
    options: options ?? providers[provider]?.options ?? {},
  });
  return JSON.stringify(providers);
}
