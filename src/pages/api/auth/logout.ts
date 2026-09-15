import type { APIRoute } from 'astro';
import { createAuth } from '../../../server/auth';

const logout: APIRoute = async ({ request }) => {
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  const response = await createAuth().handler(
    new Request(new URL('/api/auth/sign-out', request.url), {
      method: 'POST',
      headers,
      body: '{}',
    }),
  );

  if (!response.ok) return response;

  const redirectHeaders = new Headers(response.headers);
  redirectHeaders.set('location', '/');
  return new Response(null, { status: 303, headers: redirectHeaders });
};

export const GET = logout;
export const POST = logout;
