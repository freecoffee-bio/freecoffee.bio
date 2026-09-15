import type { APIRoute } from 'astro';
import { and, asc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../db';
import { contentComments, users } from '../../db/schema';
import { createAuth } from '../../server/auth';

const allowedTypes = new Set(['gallery', 'post']);

export const GET: APIRoute = async ({ url }) => {
  const contentType = url.searchParams.get('type') ?? '';
  const contentId = url.searchParams.get('id') ?? '';
  if (!allowedTypes.has(contentType) || !contentId) return Response.json({ error: 'Invalid content.' }, { status: 400 });
  const comments = await createDb(env.DB).select({ id: contentComments.id, body: contentComments.body, createdAt: contentComments.createdAt, userName: users.name }).from(contentComments).innerJoin(users, eq(contentComments.userId, users.id)).where(and(eq(contentComments.contentType, contentType), eq(contentComments.contentId, contentId))).orderBy(asc(contentComments.createdAt));
  return Response.json({ comments });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return Response.json({ error: 'Sign in to leave a comment.' }, { status: 401 });
  try {
    const input = await request.json() as { type?: unknown; id?: unknown; body?: unknown };
    const contentType = typeof input.type === 'string' ? input.type : '';
    const contentId = typeof input.id === 'string' ? input.id : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    if (!allowedTypes.has(contentType) || !contentId || !body || body.length > 2000) return Response.json({ error: 'Enter a comment up to 2000 characters.' }, { status: 400 });
    const [comment] = await createDb(env.DB).insert(contentComments).values({ id: crypto.randomUUID(), contentType, contentId, userId: session.user.id, body, createdAt: new Date() }).returning();
    return Response.json({ comment: { ...comment, userName: session.user.name } }, { status: 201 });
  } catch {
    return Response.json({ error: 'Unable to add comment.' }, { status: 400 });
  }
};
