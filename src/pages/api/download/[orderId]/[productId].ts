import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../../db';
import { orderItems, orders, productFiles } from '../../../../db/schema';
import { getCurrentUser } from '../../../../server/session';
import { createS3Client, objectUrl } from '../../../../server/s3';
import { getS3Settings } from '../../../../server/media';

export const GET: APIRoute = async ({ params, request }) => {
  const user = await getCurrentUser(request);
  const orderId = params.orderId;
  const productId = params.productId;
  if (!user || !orderId || !productId) return new Response('Download not found.', { status: 404 });

  const db = createDb(env.DB);
  const [item] = await db.select({ productId: orderItems.productId }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(eq(orderItems.orderId, orderId), eq(orderItems.productId, productId), eq(orders.buyerUserId, user.id), eq(orders.status, 'paid'))).limit(1);
  if (!item?.productId) return new Response('Download not found.', { status: 404 });

  const [file] = await db.select().from(productFiles).where(eq(productFiles.productId, item.productId)).limit(1);
  const settings = await getS3Settings(env.DB);
  if (!file || !settings) return new Response('Download file not found.', { status: 404 });

  const object = await createS3Client(settings).fetch(objectUrl(settings, file.r2Key));
  if (!object.ok) return new Response('Unable to retrieve download file.', { status: 502 });
  const headers = new Headers(object.headers);
  headers.set('Content-Disposition', `attachment; filename="${file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  return new Response(object.body, { headers });
};
