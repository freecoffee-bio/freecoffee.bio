import type { APIRoute } from 'astro';
import { markPaymentComplete, recordPaymentEvent, updatePaymentEvent, getPaymentSettings } from '../../../server/payments';
import { publicError, requestId } from '../../../server/http';
import { amountToMinor } from '../../../server/money';

async function verifyPayPalWebhook(request: Request, payload: string) {
  const settings = await getPaymentSettings();
  const webhookId = settings?.paypalWebhookId;
  const clientId = settings?.paypalClientId;
  const clientSecret = settings?.paypalClientSecret;
    const apiBase = settings?.paypalSandbox === true ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  if (!webhookId || !clientId || !clientSecret) return false;
  const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  if (!tokenResponse.ok) return false;
  const token = (await tokenResponse.json() as { access_token?: string }).access_token;
  if (!token) return false;
  const verification = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ auth_algo: request.headers.get('paypal-auth-algo'), cert_url: request.headers.get('paypal-cert-url'), transmission_id: request.headers.get('paypal-transmission-id'), transmission_sig: request.headers.get('paypal-transmission-sig'), transmission_time: request.headers.get('paypal-transmission-time'), webhook_id: webhookId, webhook_event: JSON.parse(payload) }) });
  return verification.ok && (await verification.json() as { verification_status?: string }).verification_status === 'SUCCESS';
}

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const payload = await request.text();
  if (!(await verifyPayPalWebhook(request, payload))) return publicError('Invalid webhook signature.', 400, id);
  let event: { id?: string; event_type?: string; resource?: { id?: string; custom_id?: string; supplementary_data?: { related_ids?: { order_id?: string } }; purchase_units?: Array<{ reference_id?: string; amount?: { currency_code?: string; value?: string }; payments?: { captures?: Array<{ amount?: { currency_code?: string; value?: string } }> } }> } };
  try { event = JSON.parse(payload) as typeof event; } catch (error) { console.error('Invalid PayPal webhook JSON', { id, error, payload }); return publicError('Invalid webhook payload.', 400, id); }
  if (!event.id) return publicError('Invalid event.', 400, id);
  const inserted = await recordPaymentEvent('paypal', event.id, payload);

  if (!inserted) return Response.json({ received: true }, { headers: { 'x-request-id': id } });
  try {
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' || event.event_type === 'CHECKOUT.ORDER.COMPLETED') {
      const referenceId = event.resource?.custom_id || event.resource?.purchase_units?.[0]?.reference_id;
      const providerPaymentId = event.resource?.id || event.resource?.supplementary_data?.related_ids?.order_id;
      if (referenceId && providerPaymentId) {
        const purchaseUnit = event.resource?.purchase_units?.[0];
        const capturedAmount = purchaseUnit?.payments?.captures?.[0]?.amount ?? purchaseUnit?.amount;
        if (!capturedAmount?.currency_code || !capturedAmount.value || !/^[A-Z]{3}$/.test(capturedAmount.currency_code)) throw new Error('PayPal payment amount is unavailable.');
        const actualAmount = amountToMinor(capturedAmount.value, capturedAmount.currency_code);
        await markPaymentComplete(referenceId, 'paypal', providerPaymentId, actualAmount, capturedAmount.currency_code);
        await updatePaymentEvent('paypal', event.id, 'processed');
      } else await updatePaymentEvent('paypal', event.id, 'ignored', 'Missing payment reference.');
    } else await updatePaymentEvent('paypal', event.id, 'ignored');
  } catch (error) {
    await updatePaymentEvent('paypal', event.id, 'failed', error instanceof Error ? error.message : String(error));
    return publicError('Webhook processing failed.', 500, id);
  }
  return Response.json({ received: true, requestId: id }, { headers: { 'x-request-id': id } });
};