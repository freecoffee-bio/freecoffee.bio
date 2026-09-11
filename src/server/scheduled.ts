import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, notInArray, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { orders, paymentRecords, supportTransactions } from '../db/schema';
import { processNotificationBatch } from './notifications';
import { CRYPTO_RECONCILIATION_WINDOW_MS } from './base-usdc';
import { CHAIN_PAYMENT_PROVIDERS, scanPendingChainPayments } from './chain-payments';
import { syncAutomaticExchangeRates } from './exchange-rate';
import { markPaymentComplete } from './payments';

export async function runScheduledTasks() {
  const db = createDb(env.DB);
  const now = new Date();
  let exchangeRates: 'disabled' | 'skipped' | 'synced' | 'failed' = 'failed';
  try {
    exchangeRates = await syncAutomaticExchangeRates(now);
  } catch (error) {
    console.error('Exchange rate sync scheduling failed', { message: error instanceof Error ? error.message : String(error) });
  }
  const cryptoPayments = await scanPendingChainPayments();
  let cryptoPaymentsConfirmed = 0;
  let cryptoPaymentFulfillmentFailures = 0;

  const fulfillCryptoPayment = async (payment: { referenceId: string; provider: string; transactionHash: string; amount: number; currency: string }) => {
    try {
      await markPaymentComplete(payment.referenceId, payment.provider, payment.transactionHash, payment.amount, payment.currency);
      return true;
    } catch (error) {
      cryptoPaymentFulfillmentFailures += 1;
      console.error('Chain payment fulfillment failed', { referenceId: payment.referenceId, provider: payment.provider, message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };
  for (const payment of cryptoPayments.confirmedPayments) {
    if (await fulfillCryptoPayment(payment)) cryptoPaymentsConfirmed += 1;
  }
  const recentPaidCrypto = await db.select({ referenceId: paymentRecords.referenceId, provider: paymentRecords.provider, transactionHash: paymentRecords.transactionHash, amount: paymentRecords.amount, currency: paymentRecords.currency })
    .from(paymentRecords)
    .where(and(inArray(paymentRecords.provider, [...CHAIN_PAYMENT_PROVIDERS]), eq(paymentRecords.status, 'paid'), isNotNull(paymentRecords.transactionHash), gt(paymentRecords.updatedAt, new Date(now.getTime() - 24 * 60 * 60_000))))
    .orderBy(desc(paymentRecords.updatedAt))
    .limit(200);
  for (const payment of recentPaidCrypto) await fulfillCryptoPayment({ ...payment, transactionHash: payment.transactionHash! });

  const cutoff = new Date(now.getTime() - 20 * 60_000);
  const expiredOrders = await db.update(orders).set({ status: 'expired', closedAt: now, closeReason: 'payment-timeout' }).where(and(eq(orders.status, 'pending'), or(lte(orders.expiresAt, now), and(isNull(orders.expiresAt), lte(orders.createdAt, cutoff))))).returning({ id: orders.id });
  const expiredSupports = await db.update(supportTransactions).set({ status: 'expired' }).where(and(eq(supportTransactions.status, 'pending'), lte(supportTransactions.createdAt, cutoff))).returning({ id: supportTransactions.id });
  const expiredReferences = [...expiredOrders.map((item) => item.id), ...expiredSupports.map((item) => item.id)];
  if (expiredReferences.length) {
    await db.update(paymentRecords).set({ status: 'expired', updatedAt: now }).where(and(eq(paymentRecords.status, 'pending'), notInArray(paymentRecords.provider, [...CHAIN_PAYMENT_PROVIDERS]), inArray(paymentRecords.referenceId, expiredReferences)));
  }
  const reconciliationCutoff = new Date(now.getTime() - CRYPTO_RECONCILIATION_WINDOW_MS);
  await db.update(paymentRecords).set({ status: 'expired', updatedAt: now }).where(and(inArray(paymentRecords.provider, [...CHAIN_PAYMENT_PROVIDERS]), eq(paymentRecords.status, 'pending'), lte(paymentRecords.expiresAt, reconciliationCutoff)));

  const notifications = await processNotificationBatch(8);
  console.log('Scheduled tasks completed', JSON.stringify({
    exchangeRates,
    expiredOrders: expiredOrders.length,
    expiredSupports: expiredSupports.length,
    cryptoPaymentCandidates: cryptoPayments.candidates,
    cryptoPaymentsConfirmed,
    cryptoPaymentFulfillmentFailures,
    cryptoWalletScanFailures: cryptoPayments.failedWallets,
    cryptoRpcRequests: cryptoPayments.rpcRequests,
    cryptoRpcBudgetExhausted: cryptoPayments.budgetExhausted,
    notificationCandidates: notifications.candidates,
    notificationClaimed: notifications.claimed,
    notificationSent: notifications.sent,
    notificationRetriedOrFailed: notifications.retriedOrFailed,
  }));
}
