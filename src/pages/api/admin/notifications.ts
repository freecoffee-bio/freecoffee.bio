import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { listNotificationDeliveries, listNotificationTemplates, updateNotificationTemplate } from '../../../server/notifications';

async function authorized(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  return Boolean(session?.user && await isRoot(session.user.id));
}

export const GET: APIRoute = async ({ request }) => {
  if (!await authorized(request)) return new Response('Unauthorized', { status: 401 });
  const [templates, deliveries] = await Promise.all([listNotificationTemplates(), listNotificationDeliveries()]);
  return Response.json({ templates, deliveries });
};

export const PUT: APIRoute = async ({ request }) => {
  if (!await authorized(request)) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject : '';
    const bodyText = typeof body.bodyText === 'string' ? body.bodyText : '';
    const bodyHtml = typeof body.bodyHtml === 'string' ? body.bodyHtml : null;
    if (!id || !displayName || !subject || !bodyText) return Response.json({ error: 'Display name, subject, and text body are required.' }, { status: 400 });
    const template = await updateNotificationTemplate(id, { displayName, description, subject, bodyText, bodyHtml });
    return Response.json({ template });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save template.' }, { status: 400 });
  }
};
