import type { APIRoute } from 'astro';
import { createAuth } from '../../server/auth';
import { eq } from 'drizzle-orm';
import { createDb } from '../../db';
import { users } from '../../db/schema';
import { bindRoot, hasRoot } from '../../server/admin';
import { ensureSiteSettings } from '../../server/site-settings';
import { getAdminPath } from '../../lib/config';
import { env } from 'cloudflare:workers';
import { verifyTurnstile } from '../../server/security';

export const POST: APIRoute = async ({ request, redirect }) => {
  if (await hasRoot()) return new Response('Not Found', { status: 404 });
  await verifyTurnstile(request, env.DB);

  let input: { name?: unknown; email?: unknown; password?: unknown; siteUrl?: unknown } = {};
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  try {
    if (contentType.includes('application/json')) {
      input = await request.json() as typeof input;
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      input = {
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        siteUrl: form.get('siteUrl'),
      };
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid installation request.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const siteUrl = typeof input.siteUrl === 'string' ? input.siteUrl.trim() : '';

  if (!name || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) {
    return new Response(JSON.stringify({ error: 'Enter a valid name, email, and password of 8–128 characters.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (!/^https?:\/\/[^\s]+$/i.test(siteUrl) || siteUrl.length > 500) {
    return new Response(JSON.stringify({ error: 'Enter a valid site URL.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  try {
    new URL(siteUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Enter a valid site URL.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const result = await createAuth().api.signUpEmail({ body: { name, email, password } });
  if (!result.user?.id || !(await bindRoot(result.user.id))) return new Response('Not Found', { status: 404 });
  await createDb(env.DB).update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, result.user.id));
  await ensureSiteSettings(siteUrl);
  const adminPath = getAdminPath((env as unknown as { ADMIN_PATH?: string }).ADMIN_PATH);
  return redirect(`/${adminPath}/login`, 303);
};
