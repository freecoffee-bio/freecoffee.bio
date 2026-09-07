import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { orders, paymentRecords, supportTransactions } from '../db/schema';
import { processNotificationBatch } from './notifications';

export async function runScheduledTasks() {
  const db = createDb(env.DB);
  const now = new Date();

  const cutoff = new Date(now.getTime() - 20 * 60_000);
  const expiredOrders = await db.update(orders).set({ status: 'expired', closedAt: now, closeReason: 'payment-timeout' }).where(and(eq(orders.status, 'pending'), or(lte(orders.expiresAt, now), and(isNull(orders.expiresAt), lte(orders.createdAt, cutoff))))).returning({ id: orders.id });
  // Support payments do not have a dedicated expires_at column. Keep their
  // pending lifetime consistent with checkout orders without changing schema.
  const supportCutoff = cutoff;
  const expiredSupports = await db.update(supportTransactions).set({ status: 'expired' }).where(and(eq(supportTransactions.status, 'pending'), lte(supportTransactions.createdAt, supportCutoff))).returning({ id: supportTransactions.id });
  const expiredReferences = [...expiredOrders.map((item) => item.id), ...expiredSupports.map((item) => item.id)];
  if (expiredReferences.length) {
    await db.update(paymentRecords).set({ status: 'expired', updatedAt: now }).where(and(eq(paymentRecords.status, 'pending'), inArray(paymentRecords.referenceId, expiredReferences)));
  }

  const processed = await processNotificationBatch(8);
  console.log('Scheduled tasks completed', JSON.stringify({ expiredOrders: expiredOrders.length, expiredSupports: expiredSupports.length, notificationJobs: processed }));
}
