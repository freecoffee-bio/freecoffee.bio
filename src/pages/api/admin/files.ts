import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { orderItems, productFiles, products } from '../../../db/schema';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { getOrCreateCreator } from '../../../server/creator';
import { createS3Client, objectUrl } from '../../../server/s3';
import { getS3Settings } from '../../../server/media';

export const DELETE: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await request.json() as { productId?: unknown };
    const productId = typeof body.productId === 'string' ? body.productId : '';
    const creator = await getOrCreateCreator(session.user);
    const db = createDb(env.DB);
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.creatorId, creator.id))).limit(1);
    if (!product) return Response.json({ error: 'Product not found.' }, { status: 404 });
    const [ordered] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, productId)).limit(1);
    if (ordered) return Response.json({ error: 'This product has completed orders and its file cannot be deleted.' }, { status: 409 });
    const [file] = await db.select().from(productFiles).where(eq(productFiles.productId, productId)).limit(1);
    if (!file) return Response.json({ error: 'Product file not found.' }, { status: 404 });
    const settings = await getS3Settings(env.DB);
    if (!settings) return Response.json({ error: 'Configure S3 storage before managing product files.' }, { status: 503 });
    const response = await createS3Client(settings).fetch(objectUrl(settings, file.r2Key), { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw new Error('Unable to delete product file from S3.');
    await db.delete(productFiles).where(eq(productFiles.id, file.id));
    return Response.json({ productId });
  } catch (error) {
    console.error('Product file deletion failed', error);
    return Response.json({ error: 'Unable to delete product file.' }, { status: 400 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  try {
    const form = await request.formData();
    const productId = String(form.get('productId') || '');
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 50 * 1024 * 1024) return Response.json({ error: 'Choose a file up to 50 MB.' }, { status: 400 });
    const creator = await getOrCreateCreator(session.user);
    const [product] = await createDb(env.DB).select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.creatorId, creator.id))).limit(1);
    if (!product) return Response.json({ error: 'Product not found.' }, { status: 404 });
    const db = createDb(env.DB);
    const [previous] = await db.select().from(productFiles).where(eq(productFiles.productId, productId)).limit(1);
    if (previous) {
      const [ordered] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, productId)).limit(1);
      if (ordered) return Response.json({ error: 'This product has completed orders and its file cannot be replaced.' }, { status: 409 });
    }
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'download';
    const key = `products/${creator.id}/${productId}/${id}-${safeName}`;
    const settings = await getS3Settings(env.DB);
    if (!settings) return Response.json({ error: 'Configure S3 storage before uploading product files.' }, { status: 503 });
    const upload = await createS3Client(settings).fetch(objectUrl(settings, key), { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', 'content-length': String(file.size), 'content-disposition': `attachment; filename="${safeName}"` }, body: file.stream() });
    if (!upload.ok) throw new Error('Unable to upload product file to S3.');
    const now = new Date();
    if (previous) {
      await db.update(productFiles).set({ r2Key: key, fileName: safeName, fileSize: file.size, checksum: null, createdAt: now }).where(eq(productFiles.id, previous.id));
      const cleanup = await createS3Client(settings).fetch(objectUrl(settings, previous.r2Key), { method: 'DELETE' });
      if (!cleanup.ok && cleanup.status !== 404) console.error('Previous product file cleanup failed', cleanup.status);
    } else {
      await db.insert(productFiles).values({ id, productId, r2Key: key, fileName: safeName, fileSize: file.size, createdAt: now });
    }
    return Response.json({ id: previous?.id ?? id, fileName: safeName, fileSize: file.size }, { status: previous ? 200 : 201 });
  } catch (error) {
    console.error('Product file upload failed', error);
    return Response.json({ error: 'Unable to upload product file.' }, { status: 400 });
  }
};
