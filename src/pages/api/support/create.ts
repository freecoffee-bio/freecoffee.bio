import type { APIRoute } from 'astro';
import { createSupportCheckout, type PaymentProviderName } from '../../../server/payments';
import { getCurrentUser } from '../../../server/session';
import { publicError, requestId } from '../../../server/http';
import { getSiteCallbackUrl, getSiteSettings } from '../../../server/site-settings';
import { amountToMinor } from '../../../server/money';
import { enforceRateLimit } from '../../../server/rate-limit';



export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const rate = await enforceRateLimit(request, 'support');
  if (!rate.allowed) return publicError('Too many checkout attempts. Please try again shortly.', 429, id, rate.retryAfter);
  try {
    const body = await request.json() as Record<string, unknown>;
    const provider = body.provider === 'paypal' ? 'paypal' : body.provider === 'stripe' ? 'stripe' : null;
    if (!provider) return publicError('Choose Stripe or PayPal.', 400, id);
    const settings = await getSiteSettings();
    const amount = typeof body.amount === 'string' ? amountToMinor(body.amount, settings.currency) : -1;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    const user = await getCurrentUser(request);
    const result = await createSupportCheckout({

      amount,
      currency: settings.currency,
      provider: provider as PaymentProviderName,
      email,
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      message: typeof body.message === 'string' ? body.message : undefined,
      anonymous: body.anonymous === true,
      returnUrl: `${await getSiteCallbackUrl('/support/success')}?reference={REFERENCE_ID}`,
      cancelUrl: await getSiteCallbackUrl('/'),
    });
    return Response.json({ checkoutUrl: result.url, id: result.id, userId: user?.id ?? null }, { headers: { 'x-request-id': id } });
  } catch (error) {
    console.error('Support checkout creation failed', error);
    return publicError(error instanceof Error && /valid receipt email|Support amount|Choose|not configured|unavailable|not enabled|not found/i.test(error.message) ? error.message : 'Unable to create checkout.', 400, id);
  }
};
