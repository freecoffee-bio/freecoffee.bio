import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { createDb } from '../db';
import { emailDeliverySettings } from '../db/schema';

const providerSchema = z.enum(['resend', 'brevo']);
export const activeEmailProviderSchema = z.enum(['smtp', 'resend', 'brevo']);
export type ActiveEmailProvider = z.infer<typeof activeEmailProviderSchema>;
export type ApiEmailProvider = z.infer<typeof providerSchema>;

const apiProviderConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  fromAddress: z.string().trim().email(),
  fromName: z.string().trim().max(120).optional(),
  replyTo: z.string().trim().email().optional(),
});

const apiProvidersSchema = z.partialRecord(providerSchema, apiProviderConfigSchema);
type ApiProviders = Partial<z.infer<typeof apiProvidersSchema>>;

function parseApiProviders(value: string | null | undefined): ApiProviders {
  try {
    const parsed = apiProvidersSchema.safeParse(JSON.parse(value || '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function getEmailDeliverySettings() {
  const db = createDb(env.DB);
  const [settings] = await db.select().from(emailDeliverySettings).where(eq(emailDeliverySettings.id, 1)).limit(1);
  const activeProvider = activeEmailProviderSchema.safeParse(settings?.activeProvider).data ?? null;
  const providers = parseApiProviders(settings?.apiProviders);

  return {
    activeProvider,
    providers: Object.fromEntries(Object.entries(providers).map(([provider, config]) => [provider, {
      apiKeyConfigured: Boolean(config.apiKey),
      fromAddress: config.fromAddress,
      fromName: config.fromName ?? '',
      replyTo: config.replyTo ?? '',
    }])),
  };
}

export async function getActiveEmailProviderConfig() {
  const db = createDb(env.DB);
  const [settings] = await db.select().from(emailDeliverySettings).where(eq(emailDeliverySettings.id, 1)).limit(1);
  const activeProvider = activeEmailProviderSchema.safeParse(settings?.activeProvider).data ?? null;
  return { activeProvider, providers: parseApiProviders(settings?.apiProviders) };
}

export async function saveApiEmailProvider(input: { provider: ApiEmailProvider; apiKey?: string; fromAddress: string; fromName?: string; replyTo?: string; activate: boolean }) {
  const db = createDb(env.DB);
  const [existing] = await db.select().from(emailDeliverySettings).where(eq(emailDeliverySettings.id, 1)).limit(1);
  const providers = parseApiProviders(existing?.apiProviders);
  const current = providers[input.provider];
  const config = apiProviderConfigSchema.parse({
    apiKey: input.apiKey?.trim() || current?.apiKey,
    fromAddress: input.fromAddress,
    fromName: input.fromName?.trim() || undefined,
    replyTo: input.replyTo?.trim() || undefined,
  });
  providers[input.provider] = config;
  const now = new Date();
  await db.insert(emailDeliverySettings).values({
    id: 1,
    activeProvider: input.activate ? input.provider : existing?.activeProvider ?? null,
    apiProviders: JSON.stringify(providers),
    updatedAt: now,
  }).onConflictDoUpdate({ target: emailDeliverySettings.id, set: {
    activeProvider: input.activate ? input.provider : existing?.activeProvider ?? null,
    apiProviders: JSON.stringify(providers),
    updatedAt: now,
  } });
}

export async function activateEmailProvider(provider: ActiveEmailProvider) {
  const db = createDb(env.DB);
  const [existing] = await db.select().from(emailDeliverySettings).where(eq(emailDeliverySettings.id, 1)).limit(1);
  const providers = parseApiProviders(existing?.apiProviders);
  if (provider !== 'smtp' && !providers[provider]) throw new Error('Configure this email provider before activating it.');
  const now = new Date();
  await db.insert(emailDeliverySettings).values({ id: 1, activeProvider: provider, apiProviders: JSON.stringify(providers), updatedAt: now }).onConflictDoUpdate({ target: emailDeliverySettings.id, set: { activeProvider: provider, apiProviders: JSON.stringify(providers), updatedAt: now } });
}
