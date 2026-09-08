import type { APIRoute } from 'astro';
import { findPaymentReference, markPaymentComplete, recordPaymentEvent, updatePaymentEvent, getPaymentSettings } from '../../../server/payments';
import { publicError, requestId } from '../../../server/http';

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isFinite(timestamp) || !signatures.length || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.includes(expected);
}

export const GET: APIRoute = async ({ request }) => {
  const settings = await getPaymentSettings();
  return Response.json({
    endpoint: 'stripe-webhook',
    method: 'POST',
    url: new URL('/api/webhooks/stripe', request.url).toString(),
    configured: Boolean(settings?.stripeWebhookSecret),
    message: 'Configure this exact URL in Stripe Dashboard under Developers, then Webhooks, and use that endpoint’s signing secret.',
  });
};

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');
  const settings = await getPaymentSettings();
  const secret = settings?.stripeWebhookSecret;
  if (!signature || !secret) return publicError('Webhook is not configured.', 503, id);
  if (!(await verifyStripeSignature(payload, signature, secret))) return publicError('Invalid signature.', 400, id);
  let event: { id?: string; type?: string; data?: { object?: { id?: string; client_reference_id?: string; metadata?: { reference_id?: string }; payment_status?: string; amount_total?: number; currency?: string } } };
  try { event = JSON.parse(payload) as typeof event; } catch (error) { console.error('Invalid Stripe webhook JSON', { id, error, payload }); return publicError('Invalid webhook payload.', 400, id); }
  if (!event.id) return publicError('Invalid event.', 400, id);
  const inserted = await recordPaymentEvent('stripe', event.id, payload);

  if (!inserted) return Response.json({ received: true }, { headers: { 'x-request-id': id } });
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data?.object;
      if (!session) throw new Error('Stripe checkout session is missing.');
      if (session.payment_status !== 'paid') {
        await updatePaymentEvent('stripe', event.id, 'ignored', `Checkout session payment status is ${session.payment_status || 'missing'}.`);
      } else {
        const referenceId = session.client_reference_id || session.metadata?.reference_id || (session.id ? await findPaymentReference('stripe', session.id) : null);
        if (referenceId && session.id) {
          const amount = session.amount_total;
          const currency = session.currency;
          if (!Number.isSafeInteger(amount) || typeof currency !== 'string') throw new Error('Stripe payment amount is unavailable.');
          await markPaymentComplete(referenceId, 'stripe', session.id, amount, currency);
          await updatePaymentEvent('stripe', event.id, 'processed');
        } else await updatePaymentEvent('stripe', event.id, 'ignored', 'Missing payment reference.');
      
      }
    } else await updatePaymentEvent('stripe', event.id, 'ignored');
  } catch (error) {
    await updatePaymentEvent('stripe', event.id, 'failed', error instanceof Error ? error.message : String(error));
    return publicError('Webhook processing failed.', 500, id);
  }
  return Response.json({ received: true, requestId: id }, { headers: { 'x-request-id': id } });
};
