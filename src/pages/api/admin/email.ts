import type { APIRoute } from 'astro';
import { isRoot } from '../../../server/admin';
import { createAuth } from '../../../server/auth';
import { updateSmtpSettings } from '../../../server/creator';

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const host = typeof body.host === 'string' ? body.host.trim() : '';
    const port = Number(body.port);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : undefined;

    const fromAddress = typeof body.fromAddress === 'string' ? body.fromAddress.trim() : '';
    const replyTo = typeof body.replyTo === 'string' ? body.replyTo.trim() : undefined;
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !/^\S+@\S+\.\S+$/.test(fromAddress)) return Response.json({ error: 'Enter valid SMTP host, port, and sender email.' }, { status: 400 });
    await updateSmtpSettings({ host, port, username, password, secure: body.secure !== false, fromAddress, replyTo, enabled: body.enabled === true });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('SMTP settings update failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save email settings.' }, { status: 400 });
  }
};
