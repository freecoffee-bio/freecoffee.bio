import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { env } from 'cloudflare:workers';

import { verifyTurnstile } from '../../../server/security';
import { enforceRateLimit } from '../../../server/rate-limit';

export const ALL: APIRoute = async ({ request }) => {
  const pathname = new URL(request.url).pathname
  if (request.method === 'POST' && (pathname.endsWith('/sign-in/email') || pathname.endsWith('/sign-up/email'))) {
    await verifyTurnstile(request, env.DB)
  }

  if (request.method === 'POST' && pathname.endsWith('/send-verification-email')) {
    const rateLimit = await enforceRateLimit(request, 'verification-email', 3)
    if (!rateLimit.allowed) return Response.json({ message: 'Too many verification email requests. Please try again later.' }, { status: 429, headers: { 'retry-after': String(rateLimit.retryAfter) } })
  }
  return createAuth().handler(request)
};
