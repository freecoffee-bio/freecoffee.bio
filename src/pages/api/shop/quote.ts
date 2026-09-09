import type { APIRoute } from 'astro';
import { and, asc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { creatorProfiles, products } from '../../../db/schema';
import { getSiteSettings } from '../../../server/site-settings';
import { convertCurrency } from '../../../server/exchange-rate';
import { calculateTax, formatMoney, isCurrency, type Currency } from '../../../server/money';
import { publicError, requestId } from '../../../server/http';

const providerCurrencies: Record<string, Currency[]> = { stripe: ['USD', 'CNY', 'EUR', 'GBP', 'JPY'], paypal: ['USD', 'EUR', 'GBP', 'JPY'] };

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const url = new URL(request.url);

  const productId = url.searchParams.get('productId');
  const provider = url.searchParams.get('provider') || 'stripe';
  if (!productId || !providerCurrencies[provider]) return publicError('Choose a valid product and payment provider.', 400, id);
  const db = createDb(env.DB);
  const [creator] = await db.select({ id: creatorProfiles.id }).from(creatorProfiles).orderBy(asc(creatorProfiles.id)).limit(1);
  if (!creator) return publicError('Creator page not found.', 404, id);
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.creatorId, creator.id), eq(products.status, 'published'))).limit(1);
  if (!product || !isCurrency(product.currency)) return publicError('Product not found.', 404, id);
  const settings = await getSiteSettings();
  const taxAmount = calculateTax(product.price, settings.taxRate, product.currency);
  const totalAmount = product.price + taxAmount;
  const settlementCurrency = providerCurrencies[provider].includes(product.currency) ? product.currency : 'USD';
  try {
    const settlement = settlementCurrency === product.currency ? { amount: totalAmount, rate: null, conversionRate: null } : await convertCurrency(totalAmount, product.currency, settlementCurrency);
    return Response.json({ productId, currency: product.currency, subtotal: formatMoney(product.price, product.currency), taxRate: settings.taxRate, tax: formatMoney(taxAmount, product.currency), total: formatMoney(totalAmount, product.currency), settlementCurrency, settlement: formatMoney(settlement.amount, settlementCurrency), exchangeRate: settlement.conversionRate, exchangeRateSource: settlement.rate?.source ?? null, exchangeRateAt: settlement.rate?.effectiveAt?.toISOString() ?? null }, { headers: { 'x-request-id': id, 'cache-control': 'no-store' } });
  } catch (error) {
    return publicError(error instanceof Error ? error.message : 'Unable to calculate checkout quote.', 409, id);
  }
};
