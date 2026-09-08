import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { sendTestEmail } from '../../../server/mailer';
import { publicError, requestId } from '../../../server/http';
import { enforceRateLimit } from '../../../server/rate-limit';

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const rate = await enforceRateLimit(request, 'email-test', 3);
  if (!rate.allowed) return publicError('Too many test emails. Please try again shortly.', 429, id, rate.retryAfter);
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as { to?: unknown };
    const to = typeof body.to === 'string' ? body.to.trim() : session.user.email;
    if (!/^\S+@\S+\.\S+$/.test(to)) return publicError('Enter a valid recipient email.', 400, id);
    await sendTestEmail(to);
    return Response.json({ sent: true, requestId: id }, { headers: { 'x-request-id': id } });
  } catch (error) {
    console.error('Email delivery test failed', error);
    return Response.json({ error: 'Unable to send test email. Check the delivery log for details.', requestId: id }, { status: 400, headers: { 'x-request-id': id } });
  }
};
