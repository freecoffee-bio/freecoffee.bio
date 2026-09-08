import Big from 'big.js';
import { eq } from 'drizzle-orm';
import { isCurrency, type Currency, SUPPORTED_CURRENCIES } from './money';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorPageSettings, products, siteSettings } from '../db/schema';
import { convertCurrency, saveUsdRate } from './exchange-rate';
import { mergePaymentProviderConfig, parsePaymentProviders } from './payment-config';
import { normalizeSiteUrl, composeSiteUrl } from './site-url';
export { normalizeSiteUrl };

const defaultSettings = {
  id: 1,
  siteUrl: '',
  siteName: 'FreeCoffee.bio',
  currency: 'USD' as Currency,
  taxRate: 0,
  paymentProviders: '{}',
  updatedAt: new Date(),
};



export async function getSiteSettings() {
  const db = createDb(env.DB);
  const [settings] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  const value = settings ?? defaultSettings;
  return { ...value, currency: isCurrency(value.currency) ? value.currency : 'USD' as Currency };
}

export async function ensureSiteSettings(siteUrl?: string) {
  const db = createDb(env.DB);
  const [storedSettings] = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  const existing = storedSettings ?? defaultSettings;
  const normalizedSiteUrl = siteUrl ? normalizeSiteUrl(siteUrl) : existing.siteUrl;
  if (storedSettings) {
    if (storedSettings.siteUrl !== normalizedSiteUrl) {
      await db.update(siteSettings).set({ siteUrl: normalizedSiteUrl, updatedAt: new Date() }).where(eq(siteSettings.id, 1));
    }
  } else {
    await db.insert(siteSettings).values({ ...defaultSettings, siteUrl: normalizedSiteUrl });
  }
  return getSiteSettings();
}

export async function updateSiteSettings(input: { siteUrl?: string; currency?: unknown; taxRate?: unknown; exchangeRates?: unknown; confirmCurrencyChange?: boolean }) {
  const db = createDb(env.DB);
  const existing = await getSiteSettings();
  const currency = input.currency === undefined ? existing.currency : input.currency;
  if (!isCurrency(currency)) throw new Error('Unsupported currency.');
  const taxRateValue = input.taxRate === undefined ? String(existing.taxRate) : String(input.taxRate);
  let taxRate: number;
  try {
    const basisPoints = new Big(taxRateValue).times(100).round(0, Big.roundHalfUp).toFixed(0);
    taxRate = Number.parseInt(basisPoints, 10);
  } catch {
    throw new Error('Tax rate must be between 0% and 100%.');
  }
  if (!Number.isSafeInteger(taxRate) || taxRate < 0 || taxRate > 10000) throw new Error('Tax rate must be between 0% and 100%.');
  if (currency !== existing.currency && input.confirmCurrencyChange !== true) throw new Error('Confirm currency change to migrate editable prices.');
  if (input.exchangeRates !== undefined) {
    if (!input.exchangeRates || typeof input.exchangeRates !== 'object') throw new Error('Invalid exchange rates.');
    for (const quote of SUPPORTED_CURRENCIES) {
      if (quote === 'USD') continue;
      const value = (input.exchangeRates as Record<string, unknown>)[quote];
      if (typeof value !== 'string' || value.trim() === '') continue;
      await saveUsdRate(quote, value.trim());
    }
  }
  const siteUrl = input.siteUrl === undefined ? existing.siteUrl : normalizeSiteUrl(input.siteUrl);
  if (currency !== existing.currency) {
    const productRows = await db.select().from(products);
    const productMigrations = [];
    for (const product of productRows) {
      if (!isCurrency(product.currency)) throw new Error('Cannot migrate a product with an unsupported currency.');
      productMigrations.push({ product, converted: await convertCurrency(product.price, product.currency, currency) });
    }
    const pageRows = await db.select().from(creatorPageSettings);
    const pageMigrations = [];
    for (const page of pageRows) {
      const defaultAmount = await convertCurrency(page.defaultSupportAmount, existing.currency, currency);
      const goalAmount = page.supportGoalAmount ? await convertCurrency(page.supportGoalAmount, existing.currency, currency) : null;
      pageMigrations.push({ page, defaultAmount, goalAmount });
    }
    const migrationStatements = [
      ...productMigrations.map(({ product, converted }) => db.update(products).set({ price: converted.amount, currency, updatedAt: new Date() }).where(eq(products.id, product.id))),
      ...pageMigrations.map(({ page, defaultAmount, goalAmount }) => db.update(creatorPageSettings).set({ defaultSupportAmount: defaultAmount.amount, supportGoalAmount: goalAmount?.amount ?? page.supportGoalAmount, updatedAt: new Date() }).where(eq(creatorPageSettings.creatorId, page.creatorId))),
      db.update(siteSettings).set({ siteUrl, currency, taxRate, updatedAt: new Date() }).where(eq(siteSettings.id, 1)),
    ];
    await db.batch(migrationStatements as [typeof migrationStatements[0], ...typeof migrationStatements]);
  } else {
    await db.update(siteSettings).set({ siteUrl, currency, taxRate, updatedAt: new Date() }).where(eq(siteSettings.id, 1));
  }
  return getSiteSettings();
}

export async function updateSiteUrl(value: string) {
  const siteUrl = normalizeSiteUrl(value);
  await createDb(env.DB).update(siteSettings).set({ siteUrl, updatedAt: new Date() }).where(eq(siteSettings.id, 1));
  return siteUrl;
}

export { getPaymentProviderConfig, parsePaymentProviders, validatePaymentCredentials, type PaymentProviderConfig } from './payment-config';

export async function updatePaymentProviderSettings(input: { provider: string; credentials: Record<string, string>; options?: Record<string, unknown> }) {
  const db = createDb(env.DB);
  const existing = await getSiteSettings();
  const paymentProviders = mergePaymentProviderConfig(existing.paymentProviders, input.provider, input.credentials, input.options);
  await db.update(siteSettings).set({ paymentProviders, updatedAt: new Date() }).where(eq(siteSettings.id, 1));
}

export async function disconnectPaymentProvider(provider: 'stripe' | 'paypal') {
  const db = createDb(env.DB);
  const existing = await getSiteSettings();
  const providers = parsePaymentProviders(existing.paymentProviders);
  delete providers[provider];
  await db.update(siteSettings).set({ paymentProviders: JSON.stringify(providers), updatedAt: new Date() }).where(eq(siteSettings.id, 1));
}

export async function getSiteCallbackUrl(path: string): Promise<string> {
  const settings = await getSiteSettings();
  return composeSiteUrl(settings.siteUrl, path);
}
