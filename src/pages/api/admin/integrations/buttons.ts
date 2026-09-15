import type { APIRoute } from 'astro';
import { isRoot } from '../../../../server/admin';
import { createAuth } from '../../../../server/auth';
import { listButtonIntegrations, updateButtonIntegration, type ButtonPlatform } from '../../../../server/integrations';

async function getRootUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  return session?.user && await isRoot(session.user.id) ? session.user : null;
}

export const POST: APIRoute = async ({ request }) => {
  const user = await getRootUser(request);
  if (!user) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.platform !== 'button' && body.platform !== 'github' && body.platform !== 'youtube') throw new Error('Choose a supported button type.');
    await updateButtonIntegration(user, { platform: body.platform as ButtonPlatform, enabled: body.enabled !== false, buttonText: typeof body.buttonText === 'string' ? body.buttonText : undefined, theme: typeof body.theme === 'string' ? body.theme : undefined, color: typeof body.color === 'string' ? body.color : undefined, textColor: typeof body.textColor === 'string' ? body.textColor : undefined, buttonType: typeof body.buttonType === 'string' ? body.buttonType : undefined });
    return Response.json({ integrations: await listButtonIntegrations(user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save button settings.' }, { status: 400 });
  }
};
