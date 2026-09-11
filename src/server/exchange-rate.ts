import Big from 'big.js';
import { and, eq, lte } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { exchangeRates, exchangeRateSyncState, siteSettings } from '../db/schema';
import {
  EXCHANGE_RATE_MAX_AGE_MS,
  EXCHANGE_RATE_SOURCE,
  EXCHANGE_RATE_SYNC_INTERVAL_MS,
  DEFAULT_EXCHANGE_RATE_API_URL,
  parseExchangeRateResponse,
  stablecoinQuoteFromUsdRate,
  validateExchangeRateApiUrl,
} from './exchange-rate-core';
import { amountToMinor, CURRENCY_DECIMALS, isCurrency, type Currency } from './money';

export type RateSnapshot = {
  baseCurrency: 'USD';
  quoteCurrency: Currency;
  rate: string;
  source: string;
  effectiveAt: Date;
};

export type StablecoinQuote = {
  settlementAmount: number;
  basePaymentAmount: number;
  conversionRate: string | null;
  rate: RateSnapshot | null;
};

export async function getUsdRate(quoteCurrency: Currency): Promise<RateSnapshot> {
  if (quoteCurrency === 'USD') return { baseCurrency: 'USD', quoteCurrency, rate: '1', source: 'base', effectiveAt: new Date() };
  const [row] = await createDb(env.DB).select().from(exchangeRates).where(and(eq(exchangeRates.baseCurrency, 'USD'), eq(exchangeRates.quoteCurrency, quoteCurrency))).limit(1);
  try {
    if (!row || new Big(row.rate).lte(0)) throw new Error(`Exchange rate for ${quoteCurrency} is not configured.`);
  } catch {
    throw new Error(`Exchange rate for ${quoteCurrency} is not configured.`);
  }
  if (row.effectiveAt.getTime() < Date.now() - EXCHANGE_RATE_MAX_AGE_MS) throw new Error(`Exchange rate for ${quoteCurrency} has expired.`);
  return { baseCurrency: 'USD', quoteCurrency, rate: row.rate, source: row.source, effectiveAt: row.effectiveAt };
}

export async function convertCurrency(minor: number, from: Currency, to: Currency): Promise<{ amount: number; rate: RateSnapshot | null; conversionRate: string | null }> {
  if (from === to) return { amount: minor, rate: null, conversionRate: null };
  const sourceMajor = new Big(minor).div(new Big(10).pow(CURRENCY_DECIMALS[from]));
  let targetMajor: Big;
  let rate: RateSnapshot;
  let conversionRate: string;
  if (from === 'USD') {
    rate = await getUsdRate(to);
    targetMajor = sourceMajor.times(rate.rate);
    conversionRate = rate.rate;
  } else {
    const fromRate = await getUsdRate(from);
    const usdMajor = sourceMajor.div(fromRate.rate);
    if (to === 'USD') {
      rate = fromRate;
      targetMajor = usdMajor;
      conversionRate = new Big(1).div(fromRate.rate).toFixed();
    } else {
      rate = await getUsdRate(to);
      targetMajor = usdMajor.times(rate.rate);
      conversionRate = rate.rate;
    }
  }
  return { amount: amountToMinor(targetMajor.toFixed(), to), rate, conversionRate };
}

export async function createStablecoinQuote(minor: number, currency: Currency): Promise<StablecoinQuote> {
  if (currency === 'USD') {
    const { settlementAmount, basePaymentAmount } = stablecoinQuoteFromUsdRate(minor, CURRENCY_DECIMALS.USD, '1');
    return { settlementAmount, basePaymentAmount, conversionRate: null, rate: null };
  }
  const rate = await getUsdRate(currency);
  const amounts = stablecoinQuoteFromUsdRate(minor, CURRENCY_DECIMALS[currency], rate.rate);
  return { ...amounts, conversionRate: new Big(1).div(rate.rate).toFixed(), rate };
}

export async function listUsdRates(): Promise<Partial<Record<Currency, string>>> {
  const rows = await createDb(env.DB).select({ quoteCurrency: exchangeRates.quoteCurrency, rate: exchangeRates.rate }).from(exchangeRates).where(eq(exchangeRates.baseCurrency, 'USD'));
  return Object.fromEntries(rows.filter((row) => isCurrency(row.quoteCurrency)).map((row) => [row.quoteCurrency, row.rate]));
}

export async function saveUsdRate(quoteCurrency: Currency, rate: string, source = 'manual'): Promise<void> {
  try {
    if (!isCurrency(quoteCurrency) || quoteCurrency === 'USD' || !/^\d+(?:\.\d+)?$/.test(rate) || new Big(rate).lte(0)) throw new Error('Invalid exchange rate.');
  } catch {
    throw new Error('Invalid exchange rate.');
  }
  const now = new Date();
  await createDb(env.DB).insert(exchangeRates).values({ baseCurrency: 'USD', quoteCurrency, rate, source, effectiveAt: now, updatedAt: now }).onConflictDoUpdate({ target: [exchangeRates.baseCurrency, exchangeRates.quoteCurrency], set: { rate, source, effectiveAt: now, updatedAt: now } });
}

export async function fetchExchangeRates(apiUrl: string, now = new Date()) {
  const response = await fetch(validateExchangeRateApiUrl(apiUrl), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Exchange rate service returned HTTP ${response.status}.`);
  return parseExchangeRateResponse(await response.json(), now);
}

export async function syncAutomaticExchangeRates(now = new Date(), force = false, apiUrlOverride?: string): Promise<'disabled' | 'skipped' | 'synced' | 'failed'> {
  const db = createDb(env.DB);
  const [settings] = await db.select({ mode: siteSettings.exchangeRateMode, apiUrl: siteSettings.exchangeRateApiUrl }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  if (settings?.mode === 'manual' && !force) return 'disabled';
  const apiUrl = validateExchangeRateApiUrl(apiUrlOverride ?? settings?.apiUrl ?? DEFAULT_EXCHANGE_RATE_API_URL);
  const inserted = await db.insert(exchangeRateSyncState).values({ id: 1, lastAttemptAt: now, lastSuccessAt: null, lastError: null }).onConflictDoNothing().returning({ id: exchangeRateSyncState.id });
  if (!inserted.length && !force) {
    const claimed = await db.update(exchangeRateSyncState).set({ lastAttemptAt: now, lastError: null }).where(and(
      eq(exchangeRateSyncState.id, 1),
      lte(exchangeRateSyncState.lastAttemptAt, new Date(now.getTime() - EXCHANGE_RATE_SYNC_INTERVAL_MS)),
    )).returning({ id: exchangeRateSyncState.id });
    if (!claimed.length) return 'skipped';
  }
  if (!force && inserted.length) {
    // The newly inserted state is the first automatic attempt and is already claimed.
  } else if (force) {
    await db.update(exchangeRateSyncState).set({ lastAttemptAt: now, lastError: null }).where(eq(exchangeRateSyncState.id, 1));
  }
  try {
    const snapshot = await fetchExchangeRates(apiUrl, now);
    const upsert = (quoteCurrency: keyof typeof snapshot.rates) => db.insert(exchangeRates).values({ baseCurrency: 'USD', quoteCurrency, rate: snapshot.rates[quoteCurrency], source: EXCHANGE_RATE_SOURCE, effectiveAt: snapshot.effectiveAt, updatedAt: now }).onConflictDoUpdate({ target: [exchangeRates.baseCurrency, exchangeRates.quoteCurrency], set: { rate: snapshot.rates[quoteCurrency], source: EXCHANGE_RATE_SOURCE, effectiveAt: snapshot.effectiveAt, updatedAt: now } });
    await db.batch([
      upsert('CNY'),
      upsert('EUR'),
      upsert('GBP'),
      upsert('JPY'),
      db.update(exchangeRateSyncState).set({ lastSuccessAt: now, lastError: null }).where(eq(exchangeRateSyncState.id, 1)),
    ]);
    return 'synced';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(exchangeRateSyncState).set({ lastError: message.slice(0, 500) }).where(eq(exchangeRateSyncState.id, 1));
    console.error('Automatic exchange rate sync failed', { message });
    return 'failed';
  }
}
