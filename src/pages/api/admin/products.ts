import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { orderItems, productFiles, products } from '../../../db/schema';
import { isRoot } from '../../../server/admin';
import { createAuth } from '../../../server/auth';
import { getOrCreateCreator } from '../../../server/creator';
import { getSiteSettings } from '../../../server/site-settings';
import { amountToMinor } from '../../../server/money';
import { createS3Client, objectUrl } from '../../../server/s3';
import { getS3Settings } from '../../../server/media';

async function rootUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  return session?.user && await isRoot(session.user.id) ? session.user : null;
}

export const GET: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const creator = await getOrCreateCreator(user);
  const rows = await createDb(env.DB).select().from(products).where(eq(products.creatorId, creator.id)).orderBy(desc(products.createdAt));
  return Response.json({ products: rows });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const coverImageUrl = typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() : '';
    const settings = await getSiteSettings();
    const price = typeof body.price === 'string' ? amountToMinor(body.price, settings.currency) : -1;
    const status = body.status === 'published' ? 'published' : 'draft';
    if (!name || name.length > 160 || description.length > 5000 || coverImageUrl.length > 2000 || !Number.isSafeInteger(price) || price < 0 || price > 100000000) return Response.json({ error: 'Enter a valid product name and price.' }, { status: 400 });
    if (status === 'published') return Response.json({ error: 'Create the product as a draft, upload a file, then publish it.' }, { status: 400 });
    const creator = await getOrCreateCreator(user);
    const now = new Date();
    const [product] = await createDb(env.DB).insert(products).values({ id: crypto.randomUUID(), creatorId: creator.id, name, description: description || null, coverImageUrl: coverImageUrl || null, price, currency: settings.currency, productType: 'digital', status, createdAt: now, updatedAt: now }).returning();
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    console.error('Product creation failed', error);
    return Response.json({ error: 'Unable to create product.' }, { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as { id?: unknown };
    const id = typeof body.id === 'string' ? body.id : '';
    const creator = await getOrCreateCreator(user);
    const db = createDb(env.DB);
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, id), eq(products.creatorId, creator.id))).limit(1);
    if (!product) return Response.json({ error: 'Product not found.' }, { status: 404 });
    const [ordered] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, id)).limit(1);
    if (ordered) {
      await db.update(products).set({ status: 'archived', updatedAt: new Date() }).where(eq(products.id, id));
      return Response.json({ id, status: 'archived' });
    }
    const files = await db.select({ id: productFiles.id, r2Key: productFiles.r2Key }).from(productFiles).where(eq(productFiles.productId, id));
    const settings = await getS3Settings(env.DB);
    if (files.length && !settings) return Response.json({ error: 'Configure S3 storage before deleting product files.' }, { status: 503 });
    if (settings) for (const file of files) {
      const response = await createS3Client(settings).fetch(objectUrl(settings, file.r2Key), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error('Unable to delete product file from S3.');
    }
    await db.delete(productFiles).where(eq(productFiles.productId, id));
    await db.delete(products).where(eq(products.id, id));
    return Response.json({ id });
  } catch (error) {
    console.error('Product deletion failed', error);
    return Response.json({ error: 'Unable to delete product.' }, { status: 400 });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const user = await rootUser(request);
  if (!user) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    const creator = await getOrCreateCreator(user);
    const values: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name || name.length > 160) return Response.json({ error: 'Enter a valid product name.' }, { status: 400 });
      values.name = name;
    }
    if (typeof body.description === 'string') {
      const description = body.description.trim();
      if (description.length > 5000) return Response.json({ error: 'Description is too long.' }, { status: 400 });
      values.description = description || null;
    }
    if (typeof body.coverImageUrl === 'string') {
      const coverImageUrl = body.coverImageUrl.trim();
      if (coverImageUrl.length > 2000) return Response.json({ error: 'Cover image URL is too long.' }, { status: 400 });
      values.coverImageUrl = coverImageUrl || null;
    }
    if (typeof body.price === 'string') values.price = amountToMinor(body.price, (await getSiteSettings()).currency);

    if (body.status === 'draft' || body.status === 'archived') values.status = body.status;
    if (body.status === 'published') {
          const [file] = await createDb(env.DB).select({ id: productFiles.id }).from(productFiles).where(eq(productFiles.productId, id)).limit(1);
          if (!file) return Response.json({ error: 'Upload at least one digital file before publishing.' }, { status: 400 });
          values.status = 'published';
        }
    const [product] = await createDb(env.DB).update(products).set(values).where(and(eq(products.id, id), eq(products.creatorId, creator.id))).returning();
    if (!product) return Response.json({ error: 'Product not found.' }, { status: 404 });
    return Response.json({ product });
  } catch (error) {
    console.error('Product update failed', error);
    return Response.json({ error: 'Unable to update product.' }, { status: 400 });
  }
};
