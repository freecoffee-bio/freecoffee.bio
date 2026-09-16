import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { createAuth } from '../../../server/auth';
import { createDb } from '../../../db';
import { users } from '../../../db/schema';
import { env } from 'cloudflare:workers';

import { verifyTurnstile } from '../../../server/security';
import { enforceRateLimit } from '../../../server/rate-limit';

export const ALL: APIRoute = async ({ request }) => {
  const pathname = new URL(request.url).pathname
  if (request.method === 'POST' && (pathname.endsWith('/sign-in/email') || pathname.endsWith('/sign-up/email'))) {
    await verifyTurnstile(request, env.DB)
  }

  if (request.method === 'POST' && (pathname.endsWith('/send-verification-email') || pathname.endsWith('/change-email'))) {
    if (pathname.endsWith('/send-verification-email')) {
      const body = await request.clone().json().catch(() => null) as { email?: unknown } | null
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (email) {
        const [account] = await createDb(env.DB).select({ emailVerified: users.emailVerified }).from(users).where(eq(users.email, email)).limit(1)
        if (account?.emailVerified) return Response.json({ code: 'EMAIL_ALREADY_VERIFIED', message: 'Email already verified.' }, { status: 409 })
      }
    }
    const rateLimit = await enforceRateLimit(request, 'verification-email', 1)
    if (!rateLimit.allowed) return Response.json({ message: 'Too many verification email requests. Please try again later.' }, { status: 429, headers: { 'retry-after': String(rateLimit.retryAfter) } })
  }
  return createAuth().handler(request)
};
