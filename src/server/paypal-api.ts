import { amountToMinor } from './money';
import { getPaymentSettings } from './payment-settings';
import { paypalApiBase } from './payment-payloads';
import type { PayPalCapture } from './paypal-capture';

export type PayPalAmount = { currency_code?: string; value?: string };
export type PayPalPurchaseUnit = {
  reference_id?: string;
  custom_id?: string;
  amount?: PayPalAmount;
  payments?: { captures?: Array<{ status?: string; amount?: PayPalAmount }> };
};
export type PayPalOrder = { id?: string; status?: string; purchase_units?: PayPalPurchaseUnit[] };
export type PayPalEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    amount?: PayPalAmount;
    supplementary_data?: { related_ids?: { order_id?: string } };
    purchase_units?: PayPalPurchaseUnit[];
  };
};

type PayPalOrderResult = PayPalOrder & { details?: Array<{ issue?: string }> };

export async function getPayPalAccessToken(): Promise<{ token: string; apiBase: string }> {
  const settings = await getPaymentSettings();
  if (!settings.paypalClientId || !settings.paypalClientSecret) throw new Error('PayPal is not configured.');

  const apiBase = paypalApiBase(settings.paypalSandbox);
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${settings.paypalClientId}:${settings.paypalClientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`PayPal authentication failed with status ${response.status}.`);

  const token = (await response.json() as { access_token?: string }).access_token;
  if (!token) throw new Error('PayPal did not return an access token.');
  return { token, apiBase };
}

type PayPalApiSession = { token: string; apiBase: string };

export async function getPayPalOrderDetails(orderId: string, session?: PayPalApiSession): Promise<PayPalOrder> {
  const { token, apiBase } = session ?? await getPayPalAccessToken();
  const response = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`PayPal order lookup failed with status ${response.status}.`);
  return await response.json() as PayPalOrder;
}

function parseCompletedPayPalOrder(orderId: string, result: PayPalOrderResult): PayPalCapture {
  const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
  if (result.id !== orderId || result.status !== 'COMPLETED' || capture?.status !== 'COMPLETED' || !capture.amount?.currency_code || !capture.amount.value) {
    throw new Error('PayPal capture was not completed.');
  }
  return { orderId: result.id, amount: amountToMinor(capture.amount.value, capture.amount.currency_code), currency: capture.amount.currency_code };
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalCapture> {
  const { token, apiBase } = await getPayPalAccessToken();
  const response = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `capture-${orderId}` },
  });
  const result = await response.json() as PayPalOrderResult;
  if (response.ok) return parseCompletedPayPalOrder(orderId, result);

  if (result.details?.some((detail) => detail.issue === 'ORDER_ALREADY_CAPTURED')) {
    return parseCompletedPayPalOrder(orderId, await getPayPalOrderDetails(orderId, { token, apiBase }) as PayPalOrderResult);
  }
  throw new Error(`PayPal capture failed with status ${response.status}.`);
}
