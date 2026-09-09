import type { APIRoute } from 'astro';
import { publicError, requestId } from '../../../server/http';
import { capturePayPalPayment } from '../../../server/payments';

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);

  try {
    const body = await request.json() as Record<string, unknown>;
    const referenceId = typeof body.referenceId === 'string' ? body.referenceId.trim() : '';
    if (!referenceId || referenceId.length > 100) return publicError('Invalid payment reference.', 400, id);

    const result = await capturePayPalPayment(referenceId);
    return Response.json(result, { headers: { 'x-request-id': id } });
  } catch (error) {
    console.error('PayPal capture failed', { id, error });
    const message = error instanceof Error ? error.message : '';
    if (/not found|not eligible|order ID is unavailable/i.test(message)) return publicError('Payment could not be confirmed.', 400, id);
    return publicError('Payment could not be confirmed.', 502, id);
  }
};
