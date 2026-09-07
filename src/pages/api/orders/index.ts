import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { orderItems, orders, products } from '../../../db/schema';
import { getCurrentUser } from '../../../server/session';

export const GET: APIRoute = async ({ request }) => {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: 'Sign in to view your orders.' }, { status: 401 });
  const db = createDb(env.DB);
  const rows = await db.select({ order: orders, item: orderItems, productName: products.name }).from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id)).leftJoin(products, eq(products.id, orderItems.productId)).where(eq(orders.buyerUserId, user.id)).orderBy(desc(orders.createdAt));
  const result = new Map<string, { order: typeof rows[number]['order']; items: Array<{ name: string; productId: string | null; quantity: number; amount: number }>; downloads: Array<{ productId: string; url: string }> }>();
  for (const row of rows) {
    let entry = result.get(row.order.id);
    if (!entry) { entry = { order: row.order, items: [], downloads: [] }; result.set(row.order.id, entry); }
    if (row.item && !entry.items.some((item) => item.productId === row.item?.productId)) {
      entry.items.push({ name: row.item.productName || row.item.productId || 'Product', productId: row.item.productId, quantity: row.item.quantity, amount: row.item.unitAmount });
      if (row.order.status === 'paid' && row.item.productId) entry.downloads.push({ productId: row.item.productId, url: `/api/download/${row.order.id}/${row.item.productId}` });
    }
  }
  return Response.json({ orders: [...result.values()] });
};
