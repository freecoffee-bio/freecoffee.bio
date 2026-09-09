import type { APIRoute } from 'astro';
import { capturePayPalPayment, markPaymentComplete, recordPaymentEvent, updatePaymentEvent, getPaymentSettings } from '../../../server/payments';
import { publicError, requestId } from '../../../server/http';
import { amountToMinor } from '../../../server/money';
import { paypalApiBase } from '../../../server/payment-payloads';

type PayPalAmount = { currency_code?: string; value?: string };
type PayPalPurchaseUnit = {
  reference_id?: string;
  custom_id?: string;
  amount?: PayPalAmount;
  payments?: { captures?: Array<{ amount?: PayPalAmount }> };
};
type PayPalOrder = { id?: string; status?: string; purchase_units?: PayPalPurchaseUnit[] };
type PayPalEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
    purchase_units?: PayPalPurchaseUnit[];
  };
};

async function getPayPalAccessToken() {
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

async function verifyPayPalWebhook(request: Request, payload: string) {
  const settings = await getPaymentSettings();
  if (!settings.paypalWebhookId || !settings.paypalClientId || !settings.paypalClientSecret) return false;
  const { token, apiBase } = await getPayPalAccessToken();
  const verification = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: request.headers.get('paypal-auth-algo'),
      cert_url: request.headers.get('paypal-cert-url'),
      transmission_id: request.headers.get('paypal-transmission-id'),
      transmission_sig: request.headers.get('paypal-transmission-sig'),
      transmission_time: request.headers.get('paypal-transmission-time'),
      webhook_id: settings.paypalWebhookId,
      webhook_event: JSON.parse(payload),
    }),
  });
  return verification.ok && (await verification.json() as { verification_status?: string }).verification_status === 'SUCCESS';
}

async function getPayPalOrderDetails(orderId: string): Promise<PayPalOrder> {
  const { token, apiBase } = await getPayPalAccessToken();
  const response = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`PayPal order lookup failed with status ${response.status}.`);
  return await response.json() as PayPalOrder;
}

function getReferenceId(event: PayPalEvent, order?: PayPalOrder) {
  return event.resource?.custom_id
    ?? event.resource?.purchase_units?.[0]?.custom_id
    ?? event.resource?.purchase_units?.[0]?.reference_id
    ?? order?.purchase_units?.[0]?.custom_id
    ?? order?.purchase_units?.[0]?.reference_id
    ?? null;
}

function getAmount(event: PayPalEvent, order?: PayPalOrder) {
  return event.resource?.purchase_units?.[0]?.payments?.captures?.[0]?.amount
    ?? event.resource?.purchase_units?.[0]?.amount
    ?? order?.purchase_units?.[0]?.payments?.captures?.[0]?.amount
    ?? order?.purchase_units?.[0]?.amount
    ?? null;
}

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const payload = await request.text();
  let event: PayPalEvent;
  try {
    event = JSON.parse(payload) as PayPalEvent;
  } catch (error) {
    console.error('Invalid PayPal webhook JSON', { id, error });
    return publicError('Invalid webhook payload.', 400, id);
  }
  if (!event.id) return publicError('Invalid event.', 400, id);

  let verified = false;
  try {
    verified = await verifyPayPalWebhook(request, payload);
  } catch (error) {
    console.error('PayPal webhook verification failed', { id, eventId: event.id, error });
  }
  if (!verified) return publicError('Invalid webhook signature.', 400, id);

  const inserted = await recordPaymentEvent('paypal', event.id, payload);
  if (!inserted) return Response.json({ received: true }, { headers: { 'x-request-id': id } });

  try {
    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = event.resource?.id;
      const referenceIdFromEvent = getReferenceId(event);
      const order = orderId && !referenceIdFromEvent ? await getPayPalOrderDetails(orderId) : undefined;
      const referenceId = referenceIdFromEvent ?? getReferenceId({ resource: {} }, order);
      if (!referenceId) {
        await updatePaymentEvent('paypal', event.id, 'ignored', 'Missing payment reference.');
      } else {
        await capturePayPalPayment(referenceId);
        await updatePaymentEvent('paypal', event.id, 'processed');
      }
    } else if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED' && event.event_type !== 'CHECKOUT.ORDER.COMPLETED') {
      await updatePaymentEvent('paypal', event.id, 'ignored');
    } else {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id ?? event.resource?.id;
      const referenceIdFromEvent = getReferenceId(event);
      const amountFromEvent = getAmount(event);
      const needsOrderLookup = Boolean(orderId && (!referenceIdFromEvent || !amountFromEvent || (event.event_type === 'CHECKOUT.ORDER.COMPLETED' && !event.resource?.status)));
      const order = needsOrderLookup && orderId ? await getPayPalOrderDetails(orderId) : undefined;
      const referenceId = referenceIdFromEvent ?? getReferenceId({ resource: {} }, order);
      const providerPaymentId = order?.id ?? orderId;
      const amount = amountFromEvent ?? getAmount({ resource: {} }, order);
      if (!referenceId || !providerPaymentId) {
        await updatePaymentEvent('paypal', event.id, 'ignored', 'Missing payment reference or order ID.');
      } else if (!amount?.currency_code || !amount.value || !/^[A-Z]{3}$/.test(amount.currency_code)) {
        throw new Error('PayPal payment amount is unavailable.');
      } else {
        const orderStatus = event.resource?.status ?? order?.status;
        if (event.event_type === 'CHECKOUT.ORDER.COMPLETED' && orderStatus && orderStatus !== 'COMPLETED') {
          await updatePaymentEvent('paypal', event.id, 'ignored', `PayPal order status is ${orderStatus}.`);
        } else {
          const actualAmount = amountToMinor(amount.value, amount.currency_code);
          await markPaymentComplete(referenceId, 'paypal', providerPaymentId, actualAmount, amount.currency_code);
          await updatePaymentEvent('paypal', event.id, 'processed');
        }
      }
    }
  } catch (error) {
    await updatePaymentEvent('paypal', event.id, 'failed', error instanceof Error ? error.message : String(error));
    return publicError('Webhook processing failed.', 500, id);
  }
  return Response.json({ received: true, requestId: id }, { headers: { 'x-request-id': id } });
};
