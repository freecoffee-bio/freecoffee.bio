import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { updatePaymentProviderSettings } from '../../../server/site-settings';

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const provider = body.provider === 'stripe' || body.provider === 'paypal' ? body.provider : null;
    if (!provider || !body.credentials || typeof body.credentials !== 'object' || Array.isArray(body.credentials)) return Response.json({ error: 'Invalid payment provider configuration.' }, { status: 400 });
    const credentials = Object.fromEntries(Object.entries(body.credentials).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
    const options = body.options && typeof body.options === 'object' && !Array.isArray(body.options) ? body.options as Record<string, unknown> : {};
    await updatePaymentProviderSettings({ provider, credentials, options });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Payment settings update failed', error);
    return Response.json({ error: 'Unable to save payment settings.' }, { status: 400 });
  }
};
