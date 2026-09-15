import type { APIRoute } from 'astro';
import { and, desc, eq, gte, inArray, like, lte, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { orderItems, orders, paymentEvents, paymentRecords, supportTransactions } from '../../../db/schema';
import { createAuth } from '../../../server/auth';
import { isRoot } from '../../../server/admin';
import { getOrCreateCreator } from '../../../server/creator';

export const GET: APIRoute = async ({ request }) => {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user || !(await isRoot(session.user.id))) return new Response('Unauthorized', { status: 401 });

  const requestId = crypto.randomUUID();
  try {
    const creator = await getOrCreateCreator(session.user);
    const db = createDb(env.DB);
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    const supportId = url.searchParams.get('supportId');

    if (orderId && supportId) return Response.json({ error: 'Specify either an order or a support payment, not both.' }, { status: 400 });

    if (orderId || supportId) {
      const reference = orderId
        ? await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.creatorId, creator.id))).get()
        : await db.select().from(supportTransactions).where(and(eq(supportTransactions.id, supportId!), eq(supportTransactions.creatorId, creator.id))).get();
      if (!reference) return Response.json({ error: orderId ? 'Order not found.' : 'Support payment not found.' }, { status: 404 });

      const referenceId = reference.id;
      const eventTerms = [referenceId, reference.providerPaymentId].filter((value): value is string => Boolean(value)).map((value) => like(paymentEvents.payload, `%${value}%`));
      const eventQuery = reference.provider && eventTerms.length
        ? db.select().from(paymentEvents).where(and(eq(paymentEvents.provider, reference.provider), or(...eventTerms)))
        : Promise.resolve([]);
      const [items, payments, events] = await Promise.all([
        orderId ? db.select().from(orderItems).where(eq(orderItems.orderId, referenceId)) : Promise.resolve([]),
        db.select().from(paymentRecords).where(eq(paymentRecords.referenceId, referenceId)),
        eventQuery,
      ]);
      return Response.json({ reference, items, payments, events });
    }

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
    return Response.json({ supports, orders: creatorOrders, payments });
  } catch (error) {
    console.error('Unable to load admin transaction data', { requestId, error });
    return Response.json({ error: 'Unable to load payment details.', requestId }, { status: 500 });
  }
};
