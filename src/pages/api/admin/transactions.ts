import type { APIRoute } from 'astro';
import { and, desc, eq, gte, inArray, like, lte } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { orderItems, orders, paymentEvents, paymentRecords, supportTransactions } from '../../../db/schema';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { getOrCreateCreator } from '../../../server/creator';

export const GET: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });
  const creator = await getOrCreateCreator(session.user);
  const db = createDb(env.DB);
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const status = url.searchParams.get('status');
  const provider = url.searchParams.get('provider');
  const email = url.searchParams.get('email');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const orderWhere = [eq(orders.creatorId, creator.id)];
  if (status) orderWhere.push(eq(orders.status, status));
  if (provider) orderWhere.push(eq(orders.provider, provider));
  if (email) orderWhere.push(like(orders.buyerEmail, `%${email.slice(0, 120)}%`));
  if (from && !Number.isNaN(Date.parse(from))) orderWhere.push(gte(orders.createdAt, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) orderWhere.push(lte(orders.createdAt, new Date(to)));
  const [supports, creatorOrders] = await Promise.all([
    db.select().from(supportTransactions).where(eq(supportTransactions.creatorId, creator.id)).orderBy(desc(supportTransactions.createdAt)).limit(limit),
    db.select().from(orders).where(and(...orderWhere)).orderBy(desc(orders.createdAt)).limit(limit),
  ]);
  const referenceIds = [...supports.map((item) => item.id), ...creatorOrders.map((item) => item.id)];
  const payments = referenceIds.length ? await db.select().from(paymentRecords).where(inArray(paymentRecords.referenceId, referenceIds)).orderBy(desc(paymentRecords.createdAt)) : [];
  const orderId = url.searchParams.get('orderId');
  const supportId = url.searchParams.get('supportId');
  if (orderId) {
    const order = creatorOrders.find((item) => item.id === orderId);
    if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
    const [items, orderPayments, orderEvents] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
      db.select().from(paymentRecords).where(eq(paymentRecords.referenceId, orderId)),
      db.select().from(paymentEvents).where(eq(paymentEvents.provider, order.provider || '')),
    ]);
    return Response.json({ reference: order, items, payments: orderPayments, events: orderEvents.filter((event) => event.payload.includes(orderId)) });
  }
  if (supportId) {
    const support = supports.find((item) => item.id === supportId);
    if (!support) return Response.json({ error: 'Support payment not found.' }, { status: 404 });
    const supportPayments = await db.select().from(paymentRecords).where(eq(paymentRecords.referenceId, supportId));
    const supportEvents = await db.select().from(paymentEvents).where(eq(paymentEvents.provider, support.provider || ''));
    return Response.json({ reference: support, items: [], payments: supportPayments, events: supportEvents.filter((event) => event.payload.includes(supportId)) });
  }
  return Response.json({ supports, orders: creatorOrders, payments });
};
