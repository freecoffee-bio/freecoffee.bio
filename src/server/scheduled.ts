import { and, eq, gt, inArray, isNull, lte, notInArray, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { orders, paymentRecords, supportTransactions } from '../db/schema';
import { processNotificationBatch } from './notifications';
import { BASE_USDC_PROVIDER, scanPendingBaseUsdcPayments } from './base-usdc';
import { markPaymentComplete } from './payments';

export async function runScheduledTasks() {
  const db = createDb(env.DB);
  const now = new Date();

  const cryptoPayments = await scanPendingBaseUsdcPayments();
  let cryptoPaymentsConfirmed = 0;
  for (const payment of cryptoPayments.confirmedPayments) {
    await markPaymentComplete(payment.referenceId, BASE_USDC_PROVIDER, payment.transactionHash, payment.amount, 'USDC');
    cryptoPaymentsConfirmed += 1;
  }
  const cutoff = new Date(now.getTime() - 20 * 60_000);
  const cryptoConfirmationCutoff = new Date(now.getTime() - 10 * 60_000);
  const protectedCryptoReferences = await db.select({ referenceId: paymentRecords.referenceId }).from(paymentRecords).where(and(eq(paymentRecords.provider, 'base-usdc'), eq(paymentRecords.status, 'pending'), gt(paymentRecords.expiresAt, cryptoConfirmationCutoff)));
  const protectedReferences = protectedCryptoReferences.map((payment) => payment.referenceId);
  const excludeProtected = protectedReferences.length ? notInArray(orders.id, protectedReferences) : undefined;
  const expiredOrders = await db.update(orders).set({ status: 'expired', closedAt: now, closeReason: 'payment-timeout' }).where(and(eq(orders.status, 'pending'), excludeProtected, or(lte(orders.expiresAt, now), and(isNull(orders.expiresAt), lte(orders.createdAt, cutoff))))).returning({ id: orders.id });
  // Support payments do not have a dedicated expires_at column. Keep their
  // pending lifetime consistent with checkout orders without changing schema.
  const supportCutoff = cutoff;
  const excludeProtectedSupports = protectedReferences.length ? notInArray(supportTransactions.id, protectedReferences) : undefined;
  const expiredSupports = await db.update(supportTransactions).set({ status: 'expired' }).where(and(eq(supportTransactions.status, 'pending'), excludeProtectedSupports, lte(supportTransactions.createdAt, supportCutoff))).returning({ id: supportTransactions.id });
  const expiredReferences = [...expiredOrders.map((item) => item.id), ...expiredSupports.map((item) => item.id)];
  if (expiredReferences.length) {
    await db.update(paymentRecords).set({ status: 'expired', updatedAt: now }).where(and(eq(paymentRecords.status, 'pending'), inArray(paymentRecords.referenceId, expiredReferences)));
  }

  const notifications = await processNotificationBatch(8);
  console.log('Scheduled tasks completed', JSON.stringify({
    expiredOrders: expiredOrders.length,
    expiredSupports: expiredSupports.length,
    cryptoPaymentCandidates: cryptoPayments.candidates,
    cryptoPaymentsConfirmed,
    cryptoWalletScanFailures: cryptoPayments.failedWallets,
    notificationCandidates: notifications.candidates,
    notificationClaimed: notifications.claimed,
    notificationSent: notifications.sent,
    notificationRetriedOrFailed: notifications.retriedOrFailed,
  }));
}
