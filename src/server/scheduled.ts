import { and, eq, inArray, lte } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { orders, paymentRecords } from '../db/schema';
import { processNotificationBatch } from './notifications';

export async function runScheduledTasks() {
  const db = createDb(env.DB);
  const now = new Date();

  const expired = await db.update(orders).set({ status: 'expired', closedAt: now, closeReason: 'payment-timeout' }).where(and(eq(orders.status, 'pending'), lte(orders.expiresAt, now))).returning({ id: orders.id });
  if (expired.length) {
    await db.update(paymentRecords).set({ status: 'expired', updatedAt: now }).where(and(eq(paymentRecords.status, 'pending'), inArray(paymentRecords.referenceId, expired.map((order) => order.id))));
  }

  const processed = await processNotificationBatch(8);
  console.log('Scheduled tasks completed', JSON.stringify({ expiredOrders: expired.length, notificationJobs: processed }));
}
