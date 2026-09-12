import { and, asc, eq, ne } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorPageSettings, creatorProfiles, orderItems, orders, paymentEvents, paymentRecords, products, supportTransactions, users } from '../db/schema';
import { dispatchEmailNotification } from './notifications';
import { getSiteSettings } from './site-settings';
import { buildPayPalCheckoutPayload, buildStripeCheckoutPayload } from './payment-payloads';
import { convertCurrency, type RateSnapshot } from './exchange-rate';
import { calculateTax, formatMoney, isCurrency, type Currency } from './money';
import { capturePayPalReference } from './paypal-capture';
import { CRYPTO_PAYMENT_WINDOW_MS } from './base-usdc';
import { releaseChainPaymentAmountSlot } from './chain-payment-slots';
import { createChainPaymentQuote, isChainPaymentProvider, type ChainPaymentProvider, type ChainPaymentQuote } from './chain-payments';
import { capturePayPalOrder, getPayPalAccessToken } from './paypal-api';
import { getPaymentSettings, type PaymentSettings } from './payment-settings';

export { getPaymentSettings } from './payment-settings';

export type PaymentProviderName = 'stripe' | 'paypal' | ChainPaymentProvider;
type FiatPaymentProvider = Exclude<PaymentProviderName, ChainPaymentProvider>;

export function parsePaymentProvider(value: unknown): PaymentProviderName | null {
  if (value === 'stripe' || value === 'paypal') return value;
  if (isChainPaymentProvider(value)) return value;
  return null;
}

type PaymentInput = { provider: PaymentProviderName; referenceId: string; amount: number; currency: Currency; description: string; returnUrl: string; cancelUrl: string };

type PaymentCheckout = { url: string; providerPaymentId: string; requestPayload?: string };
type PaymentSettlement = { amount: number; currency: Currency; rate: RateSnapshot | null; conversionRate: string | null };

const FIAT_PROVIDER_CURRENCIES: Record<FiatPaymentProvider, readonly Currency[]> = {
  stripe: ['USD', 'CNY', 'EUR', 'GBP', 'JPY'],
  paypal: ['USD', 'EUR', 'GBP', 'JPY'],
};

function assertProviderConfigured(provider: PaymentProviderName, settings: PaymentSettings) {
  if (provider === 'stripe' && (!settings.stripeSecretKey || !settings.stripeWebhookSecret)) throw new Error('Stripe checkout and webhook credentials are not fully configured.');
  if (provider === 'paypal' && (!settings.paypalClientId || !settings.paypalClientSecret || !settings.paypalWebhookId)) throw new Error('PayPal checkout and webhook credentials are not fully configured.');
}

function isFiatPaymentProvider(provider: PaymentProviderName): provider is FiatPaymentProvider {
  return provider === 'stripe' || provider === 'paypal';
}

async function createFiatSettlement(provider: FiatPaymentProvider, amount: number, currency: Currency): Promise<PaymentSettlement> {
  const settlementCurrency = FIAT_PROVIDER_CURRENCIES[provider].includes(currency) ? currency : 'USD';
  const settlement = settlementCurrency === currency
    ? { amount, rate: null, conversionRate: null }
    : await convertCurrency(amount, currency, settlementCurrency);

  return { ...settlement, currency: settlementCurrency };
}

async function createPaymentSettlement(provider: PaymentProviderName, amount: number, currency: Currency, chainQuote: ChainPaymentQuote | null): Promise<PaymentSettlement> {
  if (chainQuote) return { amount: chainQuote.settlementAmount, currency: 'USD', rate: chainQuote.rate, conversionRate: chainQuote.conversionRate };
  if (!isFiatPaymentProvider(provider)) throw new Error('Unsupported payment provider.');
  return createFiatSettlement(provider, amount, currency);
}

function createChainCheckout(referenceId: string, returnUrl: string, quote: ChainPaymentQuote, expiresAt: Date): PaymentCheckout {
  const url = new URL(returnUrl);
  url.pathname = `/pay/${encodeURIComponent(referenceId)}`;
  url.search = '';

  return {
    providerPaymentId: '',
    url: url.toString(),
    requestPayload: JSON.stringify({
      network: quote.network,
      asset: quote.asset,
      address: quote.wallet.address,
      amount: quote.amount,
      expiresAt: expiresAt.toISOString(),
    }),
  };
}

async function createProviderCheckout(input: PaymentInput, chainQuote: ChainPaymentQuote | null, expiresAt: Date | null): Promise<PaymentCheckout> {
  if (chainQuote && expiresAt) return createChainCheckout(input.referenceId, input.returnUrl, chainQuote, expiresAt);
  if (input.provider === 'stripe') return createStripeCheckout(input);
  if (input.provider === 'paypal') return createPayPalCheckout(input);
  throw new Error('Unsupported payment provider.');
}

async function createStripeCheckout(input: PaymentInput): Promise<PaymentCheckout> {
  const settings = await getPaymentSettings();
  const key = settings.stripeSecretKey;
  if (!key) throw new Error('Stripe is not configured.');
  const body = buildStripeCheckoutPayload(input);
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${key}:`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Stripe checkout failed with status ${response.status}.`);
  const result = await response.json() as { id?: string; url?: string };
  if (!result.id || !result.url) throw new Error('Stripe returned an invalid checkout session.');
  return { providerPaymentId: result.id, url: result.url, requestPayload: JSON.stringify(Object.fromEntries(body)) };
}

async function createPayPalCheckout(input: PaymentInput): Promise<PaymentCheckout> {
  const { token, apiBase } = await getPayPalAccessToken();
  const requestPayload = buildPayPalCheckoutPayload(input);
  const response = await fetch(`${apiBase}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload) });
  if (!response.ok) throw new Error(`PayPal order creation failed with status ${response.status}.`);
  const result = await response.json() as { id?: string; links?: Array<{ rel?: string; href?: string }> };
  const approve = result.links?.find((link) => link.rel === 'approve')?.href;
  if (!result.id || !approve) throw new Error('PayPal returned an invalid checkout order.');
  return { providerPaymentId: result.id, url: approve, requestPayload: JSON.stringify(requestPayload) };
}

export async function createSupportCheckout(input: { amount: number; currency: Currency; provider: PaymentProviderName; email: string; supporterUserId?: string; displayName?: string; message?: string; anonymous?: boolean; returnUrl: string; cancelUrl: string }) {
  const db = createDb(env.DB);
  const [creator] = await db.select().from(creatorProfiles).orderBy(asc(creatorProfiles.id)).limit(1);
  if (!creator) throw new Error('Creator page not found.');
  const [page] = await db.select().from(creatorPageSettings).where(eq(creatorPageSettings.creatorId, creator.id)).limit(1);
  if (page?.showSupport === false) throw new Error('Support is currently unavailable.');
  if (input.anonymous && page?.allowAnonymous === false) throw new Error('Anonymous support is not enabled.');

  const settings = await getPaymentSettings();
  assertProviderConfigured(input.provider, settings);
  if (!isCurrency(input.currency) || !Number.isSafeInteger(input.amount) || input.amount < (page?.minimumSupportAmount ?? 100) || input.amount > 100000000) throw new Error('Support amount is below the configured minimum.');
  if (!/^\S+@\S+\.\S+$/.test(input.email) || input.email.length > 320) throw new Error('Enter a valid receipt email.');

  const id = crypto.randomUUID();
  const now = new Date();
  const chainProvider = isChainPaymentProvider(input.provider) ? input.provider : null;
  const expiresAt = chainProvider ? new Date(now.getTime() + CRYPTO_PAYMENT_WINDOW_MS) : null;
  const cryptoQuote = chainProvider ? await createChainPaymentQuote({ provider: chainProvider, creatorId: creator.id, amount: input.amount, currency: input.currency, referenceId: id, createdAt: now, expiresAt: expiresAt! }) : null;
  const settlement = await createPaymentSettlement(input.provider, input.amount, input.currency, cryptoQuote);

  try {
    await db.batch([
      db.insert(supportTransactions).values({ id, creatorId: creator.id, supporterUserId: input.supporterUserId ?? null, supporterEmail: input.email.toLowerCase(), amount: input.amount, currency: input.currency.toUpperCase(), status: 'pending', message: input.message?.slice(0, 240) || null, displayName: input.displayName?.slice(0, 100) || null, anonymous: input.anonymous === true, provider: input.provider, createdAt: now }),
      db.insert(paymentRecords).values({ id: crypto.randomUUID(), kind: 'support', referenceId: id, amount: cryptoQuote?.amount ?? settlement.amount, currency: cryptoQuote?.asset ?? settlement.currency, provider: input.provider, quotedAmount: input.amount, quotedCurrency: input.currency.toUpperCase(), basePaymentAmount: cryptoQuote?.basePaymentAmount ?? null, exchangeRate: cryptoQuote?.rate?.rate ?? settlement.conversionRate, exchangeRateSource: cryptoQuote?.rate?.source ?? settlement.rate?.source ?? null, exchangeRateAt: cryptoQuote?.rate?.effectiveAt ?? settlement.rate?.effectiveAt ?? null, network: cryptoQuote?.network ?? null, asset: cryptoQuote?.asset ?? null, walletAddress: cryptoQuote?.wallet.address ?? null, requiredConfirmations: cryptoQuote?.wallet.requiredConfirmations ?? null, expiresAt, status: 'pending', createdAt: now, updatedAt: now }),
    ]);

    const checkout = await createProviderCheckout({ provider: input.provider, referenceId: id, amount: settlement.amount, currency: settlement.currency, description: `Support ${creator.displayName}`, returnUrl: input.returnUrl.replace('{REFERENCE_ID}', id), cancelUrl: input.cancelUrl }, cryptoQuote, expiresAt);
    if (checkout.providerPaymentId) await db.update(supportTransactions).set({ providerPaymentId: checkout.providerPaymentId }).where(eq(supportTransactions.id, id));
    await db.update(paymentRecords).set({ ...(checkout.providerPaymentId ? { providerPaymentId: checkout.providerPaymentId } : {}), rawReference: checkout.requestPayload ?? null, updatedAt: new Date() }).where(and(eq(paymentRecords.referenceId, id), eq(paymentRecords.provider, input.provider)));
    return { id, ...checkout };
  } catch (error) {
    await db.update(supportTransactions).set({ status: 'failed' }).where(eq(supportTransactions.id, id));
    await db.update(paymentRecords).set({ status: 'failed', updatedAt: new Date() }).where(eq(paymentRecords.referenceId, id));
    if (cryptoQuote) await releaseChainPaymentAmountSlot(id);
    throw error;
  }
}

export async function createOrderCheckout(input: { productId: string; email: string; buyerUserId: string; provider: PaymentProviderName; returnUrl: string; cancelUrl: string }) {
  const db = createDb(env.DB);
  const [creator] = await db.select().from(creatorProfiles).orderBy(asc(creatorProfiles.id)).limit(1);
  if (!creator) throw new Error('Creator page not found.');
  const [page] = await db.select({ showShop: creatorPageSettings.showShop }).from(creatorPageSettings).where(eq(creatorPageSettings.creatorId, creator.id)).limit(1);
  if (page?.showShop === false) throw new Error('This shop is currently unavailable.');

  const paymentSettings = await getPaymentSettings();
  assertProviderConfigured(input.provider, paymentSettings);
  const [product] = await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.creatorId, creator.id), eq(products.status, 'published'))).limit(1);
  const settings = await getSiteSettings();
  if (!product) throw new Error('Product not found.');
  if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error('Enter a valid buyer email.');

  const orderId = crypto.randomUUID();
  const now = new Date();
  const chainProvider = isChainPaymentProvider(input.provider) ? input.provider : null;
  const expiresAt = chainProvider ? new Date(now.getTime() + CRYPTO_PAYMENT_WINDOW_MS) : null;
  const currency = settings.currency;
  const subtotal = product.price;
  const taxAmount = calculateTax(subtotal, settings.taxRate, currency);
  const totalAmount = subtotal + taxAmount;
  const cryptoQuote = chainProvider ? await createChainPaymentQuote({ provider: chainProvider, creatorId: creator.id, amount: totalAmount, currency, referenceId: orderId, createdAt: now, expiresAt: expiresAt! }) : null;
  const settlement = await createPaymentSettlement(input.provider, totalAmount, currency, cryptoQuote);

  try {
    await db.batch([
      db.insert(orders).values({ id: orderId, creatorId: creator.id, buyerUserId: input.buyerUserId ?? null, buyerEmail: input.email.toLowerCase(), subtotalAmount: subtotal, taxRate: settings.taxRate, taxAmount, totalAmount, currency, settlementCurrency: settlement.currency, settlementAmount: settlement.amount, exchangeRate: settlement.conversionRate, exchangeRateSource: settlement.rate?.source ?? null, exchangeRateAt: settlement.rate?.effectiveAt ?? null, status: 'pending', provider: input.provider, expiresAt, createdAt: now }),
      db.insert(orderItems).values({ orderId, productId: product.id, productName: product.name, quantity: 1, unitAmount: product.price }),
      db.insert(paymentRecords).values({ id: crypto.randomUUID(), kind: 'order', referenceId: orderId, amount: cryptoQuote?.amount ?? settlement.amount, currency: cryptoQuote?.asset ?? settlement.currency, quotedAmount: totalAmount, quotedCurrency: currency, basePaymentAmount: cryptoQuote?.basePaymentAmount ?? null, exchangeRate: cryptoQuote?.rate?.rate ?? settlement.conversionRate, exchangeRateSource: cryptoQuote?.rate?.source ?? settlement.rate?.source ?? null, exchangeRateAt: cryptoQuote?.rate?.effectiveAt ?? settlement.rate?.effectiveAt ?? null, provider: input.provider, network: cryptoQuote?.network ?? null, asset: cryptoQuote?.asset ?? null, walletAddress: cryptoQuote?.wallet.address ?? null, requiredConfirmations: cryptoQuote?.wallet.requiredConfirmations ?? null, expiresAt: cryptoQuote ? expiresAt : null, status: 'pending', createdAt: now, updatedAt: now }),
    ]);

    const checkout = await createProviderCheckout({ provider: input.provider, referenceId: orderId, amount: settlement.amount, currency: settlement.currency, description: product.name, returnUrl: input.returnUrl.replace('{REFERENCE_ID}', orderId), cancelUrl: input.cancelUrl }, cryptoQuote, expiresAt);
    if (checkout.providerPaymentId) await db.update(orders).set({ providerPaymentId: checkout.providerPaymentId }).where(eq(orders.id, orderId));
    await db.update(paymentRecords).set({ ...(checkout.providerPaymentId ? { providerPaymentId: checkout.providerPaymentId } : {}), rawReference: checkout.requestPayload ?? null, updatedAt: new Date() }).where(and(eq(paymentRecords.referenceId, orderId), eq(paymentRecords.provider, input.provider)));
    return { id: orderId, ...checkout };
  } catch (error) {
    await db.update(orders).set({ status: 'failed' }).where(eq(orders.id, orderId));
    await db.update(paymentRecords).set({ status: 'failed', updatedAt: new Date() }).where(eq(paymentRecords.referenceId, orderId));
    if (cryptoQuote) await releaseChainPaymentAmountSlot(orderId);
    throw error;
  }
}

async function sendNotification(recipient: string, template: string, referenceId: string, data: Record<string, string>) {
  await dispatchEmailNotification({ recipient, eventKey: template, referenceId, data });
}

export async function capturePayPalPayment(referenceId: string) {
  const db = createDb(env.DB);
  return capturePayPalReference(referenceId, {
    findPayment: async (id) => {
      const [payment] = await db.select({ provider: paymentRecords.provider, providerPaymentId: paymentRecords.providerPaymentId, status: paymentRecords.status, amount: paymentRecords.amount, currency: paymentRecords.currency }).from(paymentRecords).where(eq(paymentRecords.referenceId, id)).limit(1);
      return payment ?? null;
    },
    captureOrder: capturePayPalOrder,
    completePayment: async (id, capture) => markPaymentComplete(id, 'paypal', capture.orderId, capture.amount, capture.currency),
  });
}

export async function findPaymentReference(provider: string, providerPaymentId: string) {
  const db = createDb(env.DB);
  const [payment] = await db.select({ referenceId: paymentRecords.referenceId }).from(paymentRecords).where(and(eq(paymentRecords.provider, provider), eq(paymentRecords.providerPaymentId, providerPaymentId))).limit(1);
  return payment?.referenceId ?? null;
}

export async function markPaymentComplete(referenceId: string, provider: string, providerPaymentId: string, actualAmount?: number, actualCurrency?: string) {
  const db = createDb(env.DB);
  const now = new Date();
  const [payment] = await db.select().from(paymentRecords).where(and(eq(paymentRecords.referenceId, referenceId), eq(paymentRecords.provider, provider))).limit(1);
  if (!payment) throw new Error('Payment record not found.');

  const chainProvider = isChainPaymentProvider(provider);
  if (payment.providerPaymentId && payment.providerPaymentId !== providerPaymentId) throw new Error('Payment reference does not match the checkout.');
  if (chainProvider && payment.transactionHash && payment.transactionHash !== providerPaymentId) throw new Error('Payment transaction does not match the checkout.');
  if (actualAmount !== undefined && actualAmount !== payment.amount) throw new Error('Provider payment amount does not match the checkout.');
  if (actualCurrency !== undefined && actualCurrency.toUpperCase() !== payment.currency.toUpperCase()) throw new Error('Provider payment currency does not match the checkout.');

  if (payment.status === 'paid') {
    // A previous webhook may have marked the payment paid before notification
    // enqueueing failed. Continue through the idempotent fulfillment path so a
    // later webhook can repair the missing notification.
  } else {
    if (payment.status !== 'pending') throw new Error('Payment is not eligible for completion.');
    const [claimed] = await db.update(paymentRecords).set({ status: 'paid', providerPaymentId, ...(chainProvider ? { transactionHash: providerPaymentId } : {}), updatedAt: now }).where(and(eq(paymentRecords.id, payment.id), eq(paymentRecords.status, 'pending'))).returning({ id: paymentRecords.id });
    if (!claimed) return;
  }
  if (chainProvider) await releaseChainPaymentAmountSlot(referenceId);

  if (payment.kind === 'support') {
    await db.update(supportTransactions).set({ status: 'paid', paidAt: now, providerPaymentId }).where(and(eq(supportTransactions.id, referenceId), ne(supportTransactions.status, 'paid')));
    const [support] = await db.select().from(supportTransactions).where(eq(supportTransactions.id, referenceId)).limit(1);
    if (support) {
      await sendNotification(support.supporterEmail, 'support-receipt', referenceId, { siteName: 'FreeCoffee.bio', amount: formatMoney(support.amount, support.currency as Currency), currency: support.currency });
      const [creator] = await db.select({ userEmail: users.email, displayName: creatorProfiles.displayName }).from(creatorProfiles).innerJoin(users, eq(creatorProfiles.userId, users.id)).where(eq(creatorProfiles.id, support.creatorId)).limit(1);
      if (creator) await sendNotification(creator.userEmail, 'creator-support-notification', referenceId, { siteName: 'FreeCoffee.bio', supporterName: support.displayName || 'A supporter', amount: formatMoney(support.amount, support.currency as Currency), currency: support.currency });
    }
  } else if (payment.kind === 'order') {
    await db.update(orders).set({ status: 'paid', paidAt: now, providerPaymentId, closedAt: null, closeReason: null }).where(and(eq(orders.id, referenceId), ne(orders.status, 'paid')));
    const [order] = await db.select().from(orders).where(eq(orders.id, referenceId)).limit(1);
    if (order) await sendNotification(order.buyerEmail, 'order-receipt', referenceId, { siteName: 'FreeCoffee.bio', orderId: order.id, amount: formatMoney(order.totalAmount, order.currency as Currency), currency: order.currency });
  }
}


export async function recordPaymentEvent(provider: string, providerEventId: string, payload: string) {
  const db = createDb(env.DB);
  const [existing] = await db.select({ id: paymentEvents.id, status: paymentEvents.status }).from(paymentEvents).where(and(eq(paymentEvents.provider, provider), eq(paymentEvents.providerEventId, providerEventId))).limit(1);
  if (existing && existing.status !== 'failed') return false;
  if (existing) {
    await db.update(paymentEvents).set({ payload, status: 'received', error: null }).where(eq(paymentEvents.id, existing.id));
    return true;
  }
  const inserted = await db.insert(paymentEvents).values({ id: crypto.randomUUID(), provider, providerEventId, payload, status: 'received', receivedAt: new Date() }).onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.providerEventId] }).returning({ id: paymentEvents.id });
  return inserted.length > 0;
}

export async function updatePaymentEvent(provider: string, providerEventId: string, status: 'processed' | 'ignored' | 'failed', error?: string) {
  await createDb(env.DB).update(paymentEvents).set({ status, error: error?.slice(0, 500) ?? null }).where(and(eq(paymentEvents.provider, provider), eq(paymentEvents.providerEventId, providerEventId)));
}
