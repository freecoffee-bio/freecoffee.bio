import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';
import { env } from 'cloudflare:workers';
import { verifyTurnstile } from '../../../server/security';

export const ALL: APIRoute = async ({ request }) => {
  const pathname = new URL(request.url).pathname
  if (request.method === 'POST' && (pathname.endsWith('/sign-in/email') || pathname.endsWith('/sign-up/email'))) {
    await verifyTurnstile(request, env.DB)
  }
  return createAuth().handler(request)
};
