import type { APIRoute } from 'astro';
import { isRoot } from '../../../server/admin';
import { createAuth } from '../../../server/auth';
import { updateCreatorProfile, updatePageSettings } from '../../../server/creator';
import { amountToMinor } from '../../../server/money';
import { getSiteSettings, updateSiteSettings } from '../../../server/site-settings';

async function getRootUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  return session?.user && await isRoot(session.user.id) ? session.user : null;
}

export const POST: APIRoute = async ({ request }) => {
  const user = await getRootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.siteUrl !== undefined) {
      if (typeof body.siteUrl !== 'string' || !/^https?:\/\/[^\s]+$/i.test(body.siteUrl) || body.siteUrl.length > 500) throw new Error('Enter a valid site URL.');
      await updateSiteSettings({ siteUrl: body.siteUrl });
    }
    const creator = await updateCreatorProfile(user, {

      displayName: typeof body.displayName === 'string' ? body.displayName : user.name,
      bio: typeof body.bio === 'string' ? body.bio : undefined,
      website: typeof body.website === 'string' ? body.website : undefined,
      image: typeof body.image === 'string' ? body.image : undefined,
      socialLinks: typeof body.socialLinks === 'string' ? body.socialLinks : undefined,
    });
    const currency = (await getSiteSettings()).currency;
    const defaultSupportAmount = typeof body.defaultSupportAmount === 'string' ? amountToMinor(body.defaultSupportAmount, currency) : undefined;
    const supportGoalAmount = typeof body.supportGoalAmount === 'string' ? amountToMinor(body.supportGoalAmount, currency) : undefined;
    if (typeof body.themeColor === 'string' || typeof body.welcomeMessage === 'string' || typeof body.terms === 'string' || defaultSupportAmount !== undefined || typeof body.allowAnonymous === 'boolean' || typeof body.supportGoalEnabled === 'boolean' || typeof body.supportGoalTitle === 'string' || supportGoalAmount !== undefined || typeof body.supportGoalDescription === 'string') {
      await updatePageSettings(user, {
        themeColor: typeof body.themeColor === 'string' ? body.themeColor : undefined,
        welcomeMessage: typeof body.welcomeMessage === 'string' ? body.welcomeMessage : undefined,
        terms: typeof body.terms === 'string' ? body.terms : undefined,
        defaultSupportAmount: defaultSupportAmount !== undefined && defaultSupportAmount > 0 ? defaultSupportAmount : undefined,
        allowAnonymous: typeof body.allowAnonymous === 'boolean' ? body.allowAnonymous : undefined,
        showSupport: typeof body.showSupport === 'boolean' ? body.showSupport : undefined,
        showShop: typeof body.showShop === 'boolean' ? body.showShop : undefined,
        supportGoalEnabled: typeof body.supportGoalEnabled === 'boolean' ? body.supportGoalEnabled : undefined,
        supportGoalTitle: typeof body.supportGoalTitle === 'string' ? body.supportGoalTitle : undefined,
        supportGoalAmount: supportGoalAmount !== undefined && supportGoalAmount > 0 ? supportGoalAmount : undefined,
        supportGoalDescription: typeof body.supportGoalDescription === 'string' ? body.supportGoalDescription : undefined,
      });
    }
    return Response.json({ creator });
  } catch (error) {
    console.error('Creator profile update failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save profile.' }, { status: 400 });
  }
};
