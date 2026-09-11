import type { APIRoute } from 'astro';
import { createOrderCheckout, type PaymentProviderName } from '../../../server/payments';
import { publicError, requestId } from '../../../server/http';
import { getSiteCallbackUrl } from '../../../server/site-settings';
import { getCurrentUser } from '../../../server/session';


import { enforceRateLimit } from '../../../server/rate-limit';


export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const rate = await enforceRateLimit(request, 'shop');
  if (!rate.allowed) return publicError('Too many checkout attempts. Please try again shortly.', 429, id, rate.retryAfter);
  try {
    const form = await request.formData();
    const body = Object.fromEntries(form.entries());
    const provider = body.provider === 'paypal' ? 'paypal' : body.provider === 'stripe' ? 'stripe' : body.provider === 'base-usdc' ? 'base-usdc' : null;

    const productId = typeof body.productId === 'string' ? body.productId : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const user = await getCurrentUser(request);
    if (!user) return publicError('Sign in to purchase products.', 401, id);
    if (!provider || !productId) return publicError('Choose a product and payment provider.', 400, id);
    const result = await createOrderCheckout({ productId, email, buyerUserId: user.id, provider: provider as PaymentProviderName, returnUrl: `${await getSiteCallbackUrl('/shop/success')}?reference={REFERENCE_ID}`, cancelUrl: await getSiteCallbackUrl('/') });
    if (request.headers.get('accept')?.includes('application/json')) return Response.json({ checkoutUrl: result.url }, { headers: { 'x-request-id': id } });
    return new Response(null, { status: 303, headers: { Location: result.url, 'x-request-id': id } });
  } catch (error) {
    console.error('Product checkout creation failed', error);
    return publicError('Unable to create product checkout.', 400, id);
  }
};