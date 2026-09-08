import type { APIRoute } from 'astro';
import { isRoot } from '../../../server/admin';
import { createAuth } from '../../../server/auth';
import { saveApiEmailProvider } from '../../../server/email-config';

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const provider = body.provider === 'resend' || body.provider === 'brevo' ? body.provider : null;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
    const fromAddress = typeof body.fromAddress === 'string' ? body.fromAddress.trim() : '';
    const fromName = typeof body.fromName === 'string' ? body.fromName.trim() : undefined;
    const replyTo = typeof body.replyTo === 'string' ? body.replyTo.trim() : undefined;
    if (!provider || !fromAddress || !/^\S+@\S+\.\S+$/.test(fromAddress) || (replyTo && !/^\S+@\S+\.\S+$/.test(replyTo))) return Response.json({ error: 'Enter a valid provider and sender email.' }, { status: 400 });
    await saveApiEmailProvider({ provider, apiKey, fromAddress, fromName, replyTo, activate: body.activate === true });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Email API settings update failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to save email API settings.' }, { status: 400 });
  }
};
