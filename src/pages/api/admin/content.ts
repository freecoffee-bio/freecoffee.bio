import type { APIRoute } from 'astro';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { contentComments, galleryItems, mediaFiles, posts } from '../../../db/schema';
import { deleteMedia } from '../../../server/media';
import { isRoot } from '../../../server/admin';
import { createAuth } from '../../../server/auth';
import { getOrCreateCreator } from '../../../server/creator';

async function rootUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  return session?.user && await isRoot(session.user.id) ? session.user : null;
}

export const GET: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const creator = await getOrCreateCreator(user);
  const db = createDb(env.DB);
  const [gallery, postsList] = await Promise.all([
    db.select().from(galleryItems).where(eq(galleryItems.creatorId, creator.id)).orderBy(galleryItems.sortOrder),
    db.select().from(posts).where(eq(posts.creatorId, creator.id)).orderBy(desc(posts.createdAt)),
  ]);
  return Response.json({ gallery, posts: postsList });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const type = body.type === 'gallery' ? 'gallery' : body.type === 'post' ? 'post' : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const creator = await getOrCreateCreator(user);
    if (!type || !title || title.length > 160) return Response.json({ error: 'Enter a valid content title.' }, { status: 400 });
    const now = new Date();
    const db = createDb(env.DB);
    if (type === 'gallery') {
      const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
      if (!imageUrl || imageUrl.length > 1000) return Response.json({ error: 'Add an image URL for the gallery item.' }, { status: 400 });
      const [item] = await db.insert(galleryItems).values({ id: crypto.randomUUID(), creatorId: creator.id, title, description: typeof body.description === 'string' ? body.description.trim() || null : null, imageUrl, linkUrl: typeof body.linkUrl === 'string' ? body.linkUrl.trim() || null : null, status: 'draft', createdAt: now, updatedAt: now }).returning();
      return Response.json({ item }, { status: 201 });
    }
    const bodyText = typeof body.body === 'string' ? body.body.trim() : '';
    const coverImageUrl = typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() : '';
    if (!bodyText || bodyText.length > 20000 || coverImageUrl.length > 2000) return Response.json({ error: 'Enter post content up to 20,000 characters.' }, { status: 400 });
    const publish = body.publish === true;
    const [post] = await db.insert(posts).values({ id: crypto.randomUUID(), creatorId: creator.id, title, excerpt: typeof body.excerpt === 'string' ? body.excerpt.trim() || null : null, coverImageUrl: coverImageUrl || null, body: bodyText, status: publish ? 'published' : 'draft', publishedAt: publish ? now : null, createdAt: now, updatedAt: now }).returning();
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    console.error('Content creation failed', error);
    return Response.json({ error: 'Unable to create content.' }, { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const type = body.type === 'gallery' ? 'gallery' : body.type === 'post' ? 'post' : '';
    const id = typeof body.id === 'string' ? body.id : '';
    if (!type || !id) return Response.json({ error: 'Invalid content deletion.' }, { status: 400 });
    const creator = await getOrCreateCreator(user);
    const db = createDb(env.DB);
    if (type === 'gallery') {
      const [item] = await db.select().from(galleryItems).where(and(eq(galleryItems.creatorId, creator.id), or(eq(galleryItems.id, id), eq(galleryItems.albumId, id)))).limit(1);
      if (!item) return Response.json({ error: 'Gallery album not found.' }, { status: 404 });
      const albumId = item.albumId;
      const albumItems = albumId ? await db.select().from(galleryItems).where(and(eq(galleryItems.albumId, albumId), eq(galleryItems.creatorId, creator.id))) : [item];
      const media = await db.select({ id: mediaFiles.id }).from(mediaFiles).where(inArray(mediaFiles.publicUrl, albumItems.map((entry) => entry.imageUrl)));
      await db.delete(galleryItems).where(and(eq(galleryItems.creatorId, creator.id), albumId ? eq(galleryItems.albumId, albumId) : eq(galleryItems.id, item.id)));
      await db.delete(contentComments).where(and(eq(contentComments.contentType, 'gallery'), eq(contentComments.contentId, albumId ?? item.id)));
      for (const file of media) {
        try { await deleteMedia(env.DB, file.id); } catch (error) { console.error('Gallery media cleanup failed', error); }
      }
      return Response.json({ id, type });
    }
    const [post] = await db.delete(posts).where(and(eq(posts.id, id), eq(posts.creatorId, creator.id))).returning({ id: posts.id });
    if (!post) return Response.json({ error: 'Post not found.' }, { status: 404 });
    await db.delete(contentComments).where(and(eq(contentComments.contentType, 'post'), eq(contentComments.contentId, post.id)));
    return Response.json({ id, type });
  } catch (error) {
    console.error('Content deletion failed', error);
    return Response.json({ error: 'Unable to delete content.' }, { status: 400 });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const type = body.type === 'gallery' ? 'gallery' : body.type === 'post' ? 'post' : '';
    const id = typeof body.id === 'string' ? body.id : '';
    const status = body.status === 'published' ? 'published' : body.status === 'draft' ? 'draft' : '';
    if (!type || !id) return Response.json({ error: 'Invalid content update.' }, { status: 400 });
    const creator = await getOrCreateCreator(user);
    const now = new Date();
    const db = createDb(env.DB);
    if (type === 'gallery') {
      const [target] = await db.select({ id: galleryItems.id, albumId: galleryItems.albumId }).from(galleryItems).where(and(eq(galleryItems.creatorId, creator.id), or(eq(galleryItems.id, id), eq(galleryItems.albumId, id)))).limit(1);
      if (!target) return Response.json({ error: 'Gallery album not found.' }, { status: 404 });
      const values: Partial<typeof galleryItems.$inferInsert> = { updatedAt: now };
      if (status) values.status = status;
      if (typeof body.title === 'string') values.title = body.title.trim();
      if (typeof body.description === 'string') values.description = body.description.trim() || null;
      const where = target.albumId ? eq(galleryItems.albumId, target.albumId) : eq(galleryItems.id, target.id);
      const [item] = await db.update(galleryItems).set(values).where(and(where, eq(galleryItems.creatorId, creator.id))).returning();
      if (!item) return Response.json({ error: 'Gallery album not found.' }, { status: 404 });
      return Response.json({ item });
    }
    const values: Partial<typeof posts.$inferInsert> = { updatedAt: now };
    if (status) {
      values.status = status;
      values.publishedAt = status === 'published' ? now : null;
    }
    if (typeof body.title === 'string') values.title = body.title.trim();
    if (typeof body.excerpt === 'string') values.excerpt = body.excerpt.trim() || null;
    if (typeof body.coverImageUrl === 'string') {
      const coverImageUrl = body.coverImageUrl.trim();
      if (coverImageUrl.length > 2000) return Response.json({ error: 'Cover image URL is too long.' }, { status: 400 });
      values.coverImageUrl = coverImageUrl || null;
    }
    if (typeof body.body === 'string') values.body = body.body.trim();
    const [post] = await db.update(posts).set(values).where(and(eq(posts.id, id), eq(posts.creatorId, creator.id))).returning();
    if (!post) return Response.json({ error: 'Post not found.' }, { status: 404 });
    return Response.json({ post });
  } catch (error) {
    console.error('Content update failed', error);
    return Response.json({ error: 'Unable to update content.' }, { status: 400 });
  }
};
