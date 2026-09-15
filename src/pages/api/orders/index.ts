import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { orderItems, orders, products, supportTransactions } from '../../../db/schema';
import { getCurrentUser } from '../../../server/session';

export const GET: APIRoute = async ({ request }) => {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: 'Sign in to view your orders.' }, { status: 401 });
  const db = createDb(env.DB);
  const [rows, supports] = await Promise.all([
    db.select({ order: orders, item: orderItems, productName: products.name }).from(orders).leftJoin(orderItems, eq(orderItems.orderId, orders.id)).leftJoin(products, eq(products.id, orderItems.productId)).where(eq(orders.buyerUserId, user.id)).orderBy(desc(orders.createdAt)),
    db.select().from(supportTransactions).where(eq(supportTransactions.supporterUserId, user.id)).orderBy(desc(supportTransactions.createdAt)),
  ]);
  const result = new Map<string, { kind: 'order'; order: typeof rows[number]['order']; items: Array<{ name: string; productId: string | null; quantity: number; amount: number }>; downloads: Array<{ productId: string; url: string }> }>();
  for (const row of rows) {
    let entry = result.get(row.order.id);
    if (!entry) { entry = { kind: 'order', order: row.order, items: [], downloads: [] }; result.set(row.order.id, entry); }
    if (row.item && !entry.items.some((item) => item.productId === row.item?.productId)) {
      entry.items.push({ name: row.item.productName || row.item.productId || 'Product', productId: row.item.productId, quantity: row.item.quantity, amount: row.item.unitAmount });
      if (row.order.status === 'paid' && row.item.productId) entry.downloads.push({ productId: row.item.productId, url: `/api/download/${row.order.id}/${row.item.productId}` });
    }
  }
  const entries = [
    ...[...result.values()],
    ...supports.map((support) => ({ kind: 'support' as const, support })),
  ].sort((left, right) => {
    const leftDate = left.kind === 'order' ? left.order.createdAt : left.support.createdAt;
    const rightDate = right.kind === 'order' ? right.order.createdAt : right.support.createdAt;
    return new Date(rightDate).getTime() - new Date(leftDate).getTime();
  });
  return Response.json({ orders: entries });
};
