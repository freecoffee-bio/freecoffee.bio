import { and, asc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorPageSettings, creatorProfiles, orderItems, orders, paymentEvents, paymentRecords, products, supportTransactions, users, siteSettings } from '../db/schema';
import { dispatchEmailNotification } from './notifications';
import { getPaymentProviderConfig, getSiteSettings } from './site-settings';
import { buildPayPalCheckoutPayload, buildStripeCheckoutPayload, paypalApiBase } from './payment-payloads';
import { convertCurrency } from './exchange-rate';
import { amountToMinor, calculateTax, formatMoney, isCurrency, type Currency } from './money';
import { capturePayPalReference, type PayPalCapture } from './paypal-capture';

export type PaymentProviderName = 'stripe' | 'paypal';

type PaymentInput = { provider: PaymentProviderName; referenceId: string; amount: number; currency: Currency; description: string; returnUrl: string; cancelUrl: string; anonymous?: boolean };

type PaymentCheckout = { url: string; providerPaymentId: string; requestPayload?: string };

export async function getPaymentSettings() {
  const settings = await getSiteSettings();
  const stripe = getPaymentProviderConfig(settings, 'stripe');
  const paypal = getPaymentProviderConfig(settings, 'paypal');
  return { stripeSecretKey: stripe.credentials.secretKey ?? '', stripeWebhookSecret: stripe.credentials.webhookSecret ?? '', paypalClientId: paypal.credentials.clientId ?? '', paypalClientSecret: paypal.credentials.clientSecret ?? '', paypalWebhookId: paypal.credentials.webhookId ?? '', paypalSandbox: paypal.options.sandbox === true };
}

async function createStripeCheckout(input: PaymentInput): Promise<PaymentCheckout> {
  const settings = await getPaymentSettings();
  const key = settings?.stripeSecretKey; 
  if (!key) throw new Error('Stripe is not configured.');
  const body = buildStripeCheckoutPayload(input);
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${key}:`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error(`Stripe checkout failed with status ${response.status}.`);
  const result = await response.json() as { id?: string; url?: string };
  if (!result.id || !result.url) throw new Error('Stripe returned an invalid checkout session.');
  return { providerPaymentId: result.id, url: result.url, requestPayload: JSON.stringify(Object.fromEntries(body)) };
}


async function getPayPalAccessToken() {
  const settings = await getPaymentSettings();
  const clientId = settings?.paypalClientId;
  const clientSecret = settings?.paypalClientSecret;
  if (!clientId || !clientSecret) throw new Error('PayPal is not configured.');
  const response = await fetch(`${paypalApiBase(settings?.paypalSandbox === true)}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!response.ok) throw new Error(`PayPal authentication failed with status ${response.status}.`);
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error('PayPal did not return an access token.');
  return result.access_token;
}

async function createPayPalCheckout(input: PaymentInput): Promise<PaymentCheckout> {
  const token = await getPayPalAccessToken();
  const settings = await getPaymentSettings();
  const requestPayload = buildPayPalCheckoutPayload(input);
  const response = await fetch(`${paypalApiBase(settings?.paypalSandbox === true)}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestPayload) });
  if (!response.ok) throw new Error(`PayPal order creation failed with status ${response.status}.`);
  const result = await response.json() as { id?: string; links?: Array<{ rel?: string; href?: string }> };
  const approve = result.links?.find((link) => link.rel === 'approve')?.href;
  if (!result.id || !approve) throw new Error('PayPal returned an invalid checkout order.');
  return { providerPaymentId: result.id, url: approve, requestPayload: JSON.stringify(requestPayload) };
}

export async function createSupportCheckout(input: { amount: number; currency: Currency; provider: PaymentProviderName; email: string; displayName?: string; message?: string; anonymous?: boolean; returnUrl: string; cancelUrl: string }) {
  const db = createDb(env.DB);
  const [creator] = await db.select().from(creatorProfiles).orderBy(asc(creatorProfiles.id)).limit(1);
  if (!creator) throw new Error('Creator page not found.');
  const [page] = await db.select().from(creatorPageSettings).where(eq(creatorPageSettings.creatorId, creator.id)).limit(1);
  if (page?.showSupport === false) throw new Error('Support is currently unavailable.');
  if (input.anonymous && page?.allowAnonymous === false) throw new Error('Anonymous support is not enabled.');
  const settings = await getPaymentSettings();
  if (input.provider === 'stripe' && (!settings?.stripeSecretKey || !settings.stripeWebhookSecret)) throw new Error('Stripe checkout and webhook credentials are not fully configured.');
  if (input.provider === 'paypal' && (!settings?.paypalClientId || !settings.paypalClientSecret || !settings.paypalWebhookId)) throw new Error('PayPal checkout and webhook credentials are not fully configured.');
  if (!isCurrency(input.currency) || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 100000000) throw new Error('Support amount is invalid.');
  if (!/^\S+@\S+\.\S+$/.test(input.email) || input.email.length > 320) throw new Error('Enter a valid receipt email.');
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(supportTransactions).values({ id, creatorId: creator.id, supporterEmail: input.email.toLowerCase(), amount: input.amount, currency: input.currency.toUpperCase(), status: 'pending', message: input.message?.slice(0, 240) || null, displayName: input.displayName?.slice(0, 100) || null, anonymous: input.anonymous === true, provider: input.provider, createdAt: now });
  await db.insert(paymentRecords).values({ id: crypto.randomUUID(), kind: 'support', referenceId: id, amount: input.amount, currency: input.currency.toUpperCase(), provider: input.provider, quotedAmount: input.amount, quotedCurrency: input.currency.toUpperCase(), status: 'pending', createdAt: now, updatedAt: now });
  try {
    const checkout = input.provider === 'stripe' ? await createStripeCheckout({ provider: input.provider, referenceId: id, amount: input.amount, currency: input.currency, description: `Support ${creator.displayName}`, returnUrl: input.returnUrl.replace('{REFERENCE_ID}', id), cancelUrl: input.cancelUrl }) : await createPayPalCheckout({ provider: input.provider, referenceId: id, amount: input.amount, currency: input.currency, description: `Support ${creator.displayName}`, returnUrl: input.returnUrl.replace('{REFERENCE_ID}', id), cancelUrl: input.cancelUrl });
    await db.update(supportTransactions).set({ providerPaymentId: checkout.providerPaymentId }).where(eq(supportTransactions.id, id));
    await db.update(paymentRecords).set({ providerPaymentId: checkout.providerPaymentId, rawReference: checkout.requestPayload ?? null, updatedAt: new Date() }).where(and(eq(paymentRecords.referenceId, id), eq(paymentRecords.provider, input.provider)));
    return { id, ...checkout };
  } catch (error) {
    await db.update(supportTransactions).set({ status: 'failed' }).where(eq(supportTransactions.id, id));
    await db.update(paymentRecords).set({ status: 'failed', updatedAt: new Date() }).where(eq(paymentRecords.referenceId, id));
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
  if (input.provider === 'stripe' && (!paymentSettings?.stripeSecretKey || !paymentSettings.stripeWebhookSecret)) throw new Error('Stripe checkout and webhook credentials are not fully configured.');
  if (input.provider === 'paypal' && (!paymentSettings?.paypalClientId || !paymentSettings.paypalClientSecret || !paymentSettings.paypalWebhookId)) throw new Error('PayPal checkout and webhook credentials are not fully configured.');
  const [product] = await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.creatorId, creator.id), eq(products.status, 'published'))).limit(1);
  const settings = await getSiteSettings();
  if (!product) throw new Error('Product not found.');
  if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error('Enter a valid buyer email.');
  const orderId = crypto.randomUUID();
  const now = new Date();
  const currency = settings.currency;
  const subtotal = product.price;
  const taxAmount = calculateTax(subtotal, settings.taxRate, currency);
  const totalAmount = subtotal + taxAmount;
  const providerCurrencies: Record<PaymentProviderName, Currency[]> = { stripe: ['USD', 'CNY', 'EUR', 'GBP', 'JPY'], paypal: ['USD', 'EUR', 'GBP', 'JPY'] };
  const settlementCurrency: Currency = providerCurrencies[input.provider].includes(currency) ? currency : 'USD';
  const settlement = settlementCurrency === currency ? { amount: totalAmount, rate: null, conversionRate: null } : await convertCurrency(totalAmount, currency, settlementCurrency);
  await db.insert(orders).values({ id: orderId, creatorId: creator.id, buyerUserId: input.buyerUserId ?? null, buyerEmail: input.email.toLowerCase(), subtotalAmount: subtotal, taxRate: settings.taxRate, taxAmount, totalAmount, currency, settlementCurrency, settlementAmount: settlement.amount, exchangeRate: settlement.conversionRate, exchangeRateSource: settlement.rate?.source ?? null, exchangeRateAt: settlement.rate?.effectiveAt ?? null, status: 'pending', provider: input.provider, expiresAt: new Date(now.getTime() + 20 * 60_000), createdAt: now });
  await db.insert(orderItems).values({ orderId, productId: product.id, productName: product.name, quantity: 1, unitAmount: product.price });
  await db.insert(paymentRecords).values({ id: crypto.randomUUID(), kind: 'order', referenceId: orderId, amount: settlement.amount, currency: settlementCurrency, quotedAmount: totalAmount, quotedCurrency: currency, provider: input.provider, status: 'pending', createdAt: now, updatedAt: now });
  try {
    const checkout = input.provider === 'stripe' ? await createStripeCheckout({ provider: input.provider, referenceId: orderId, amount: settlement.amount, currency: settlementCurrency, description: product.name, returnUrl: input.returnUrl.replace('{REFERENCE_ID}', orderId), cancelUrl: input.cancelUrl }) : await createPayPalCheckout({ provider: input.provider, referenceId: orderId, amount: settlement.amount, currency: settlementCurrency, description: product.name, returnUrl: input.returnUrl.replace('{REFERENCE_ID}', orderId), cancelUrl: input.cancelUrl });
    await db.update(orders).set({ providerPaymentId: checkout.providerPaymentId }).where(eq(orders.id, orderId));
    await db.update(paymentRecords).set({ providerPaymentId: checkout.providerPaymentId, rawReference: checkout.requestPayload ?? null, updatedAt: new Date() }).where(and(eq(paymentRecords.referenceId, orderId), eq(paymentRecords.provider, input.provider)));
    return { id: orderId, ...checkout };
  } catch (error) {
    await db.update(orders).set({ status: 'failed' }).where(eq(orders.id, orderId));
    await db.update(paymentRecords).set({ status: 'failed', updatedAt: new Date() }).where(eq(paymentRecords.referenceId, orderId));
    throw error;
  }
}

async function sendNotification(recipient: string, template: string, referenceId: string, data: Record<string, string>) {
  await dispatchEmailNotification({ recipient, eventKey: template, referenceId, data });
}

type PayPalOrderResult = { id?: string; status?: string; purchase_units?: Array<{ payments?: { captures?: Array<{ status?: string; amount?: { currency_code?: string; value?: string } }> } }> };

function parseCompletedPayPalOrder(orderId: string, result: PayPalOrderResult): PayPalCapture {
  const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
  if (result.id !== orderId || result.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' || !capture.amount?.currency_code || !capture.amount.value) throw new Error('PayPal capture was not completed.');
  return { orderId: result.id, amount: amountToMinor(capture.amount.value, capture.amount.currency_code), currency: capture.amount.currency_code };
}

async function capturePayPalOrder(orderId: string): Promise<PayPalCapture> {
  const token = await getPayPalAccessToken();
  const settings = await getPaymentSettings();
  const apiBase = paypalApiBase(settings.paypalSandbox);
  const response = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `capture-${orderId}` },
  });
  const result = await response.json() as PayPalOrderResult & { details?: Array<{ issue?: string }> };
  if (response.ok) return parseCompletedPayPalOrder(orderId, result);

  if (result.details?.some((detail) => detail.issue === 'ORDER_ALREADY_CAPTURED')) {
    const lookup = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!lookup.ok) throw new Error(`PayPal order lookup failed with status ${lookup.status}.`);
    return parseCompletedPayPalOrder(orderId, await lookup.json() as PayPalOrderResult);
  }
  throw new Error(`PayPal capture failed with status ${response.status}.`);
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
  if (payment.providerPaymentId && payment.providerPaymentId !== providerPaymentId) throw new Error('Payment reference does not match the checkout.');
  if (actualAmount !== undefined && actualAmount !== payment.amount) throw new Error('Provider payment amount does not match the checkout.');
  if (actualCurrency !== undefined && actualCurrency.toUpperCase() !== payment.currency.toUpperCase()) throw new Error('Provider payment currency does not match the checkout.');

  if (payment.status === 'paid') {
    // A previous webhook may have marked the payment paid before notification
    // enqueueing failed. Continue through the idempotent fulfillment path so a
    // later webhook can repair the missing notification.

  } else {
    if (payment.status !== 'pending') throw new Error('Payment is not eligible for completion.');
    const [claimed] = await db.update(paymentRecords).set({ status: 'paid', providerPaymentId, updatedAt: now }).where(and(eq(paymentRecords.id, payment.id), eq(paymentRecords.status, 'pending'))).returning({ id: paymentRecords.id });
    if (!claimed) return;

  }
  if (payment.kind === 'support') {
    await db.update(supportTransactions).set({ status: 'paid', paidAt: now, providerPaymentId }).where(eq(supportTransactions.id, referenceId));
    const [support] = await db.select().from(supportTransactions).where(eq(supportTransactions.id, referenceId)).limit(1);
    if (support) {
      await sendNotification(support.supporterEmail, 'support-receipt', referenceId, { siteName: 'FreeCoffee.bio', amount: formatMoney(support.amount, support.currency as Currency), currency: support.currency });
      const [creator] = await db.select({ userEmail: users.email, displayName: creatorProfiles.displayName }).from(creatorProfiles).innerJoin(users, eq(creatorProfiles.userId, users.id)).where(eq(creatorProfiles.id, support.creatorId)).limit(1);
      if (creator) await sendNotification(creator.userEmail, 'creator-support-notification', referenceId, { siteName: 'FreeCoffee.bio', supporterName: support.displayName || 'A supporter', amount: formatMoney(support.amount, support.currency as Currency), currency: support.currency });
    }
  } else if (payment.kind === 'order') {
    await db.update(orders).set({ status: 'paid', paidAt: now, providerPaymentId }).where(eq(orders.id, referenceId));
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
