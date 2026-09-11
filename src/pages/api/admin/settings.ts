import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { updateSiteSettings } from '../../../server/site-settings';
import { fetchExchangeRates } from '../../../server/exchange-rate';

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });

  let body: { siteUrl?: unknown; currency?: unknown; taxRate?: unknown; exchangeRateMode?: unknown; exchangeRateApiUrl?: unknown; exchangeRates?: unknown; confirmCurrencyChange?: unknown; forceRefresh?: unknown };
  try {
    body = await request.json() as { siteUrl?: unknown; currency?: unknown; taxRate?: unknown; exchangeRates?: unknown };
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (body.siteUrl !== undefined && (typeof body.siteUrl !== 'string' || !/^https?:\/\/[^\s]+$/i.test(body.siteUrl) || body.siteUrl.length > 500)) {
    return Response.json({ error: 'Enter a valid site URL.' }, { status: 400 });
  }

  try {
    if (body.forceRefresh === true) {
      const snapshot = await fetchExchangeRates(String(body.exchangeRateApiUrl ?? ''));
      return Response.json({ ok: true, exchangeRates: snapshot.rates });
    }
    const settings = await updateSiteSettings({
      siteUrl: typeof body.siteUrl === 'string' ? body.siteUrl : undefined,
      currency: body.currency,
      taxRate: body.taxRate,
      exchangeRateMode: body.exchangeRateMode,
      exchangeRateApiUrl: body.exchangeRateApiUrl,
      exchangeRates: body.exchangeRates,
      confirmCurrencyChange: body.confirmCurrencyChange === true,
    });
    return Response.json({ currency: settings.currency, taxRate: settings.taxRate, exchangeRateMode: settings.exchangeRateMode });
  } catch (error) {
    console.error('Site settings update failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save settings.' }, { status: 400 });
  }
};
