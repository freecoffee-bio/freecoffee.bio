import type { APIRoute } from 'astro';
import { and, eq, lte } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { paymentRecords } from '../../../db/schema';
import { isChainPaymentProvider, scanPendingChainPayments } from '../../../server/chain-payments';
import { publicError, requestId } from '../../../server/http';
import { CRYPTO_RECONCILIATION_WINDOW_MS } from '../../../server/base-usdc';
import { markPaymentComplete } from '../../../server/payments';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const referenceId = new URL(request.url).searchParams.get('reference')?.trim() ?? '';
  if (!referenceId || referenceId.length > 100) return publicError('Invalid payment reference.', 400, id);
  const db = createDb(env.DB);
  const fields = { id: paymentRecords.id, provider: paymentRecords.provider, amount: paymentRecords.amount, currency: paymentRecords.currency, status: paymentRecords.status, confirmations: paymentRecords.confirmations, requiredConfirmations: paymentRecords.requiredConfirmations, transactionHash: paymentRecords.transactionHash, expiresAt: paymentRecords.expiresAt, updatedAt: paymentRecords.updatedAt };
  let [payment] = await db.select(fields).from(paymentRecords).where(eq(paymentRecords.referenceId, referenceId)).limit(1);
  if (!payment || !isChainPaymentProvider(payment.provider)) return publicError('Payment not found.', 404, id);

  if (payment.status === 'pending') {
    const now = new Date();
    const refreshCutoff = new Date(now.getTime() - 15_000);
    const [refreshClaim] = await db.update(paymentRecords).set({ updatedAt: now }).where(and(eq(paymentRecords.id, payment.id), eq(paymentRecords.status, 'pending'), lte(paymentRecords.updatedAt, refreshCutoff))).returning({ id: paymentRecords.id });
    if (refreshClaim) {
      try {
        const scan = await scanPendingChainPayments(referenceId, payment.provider);
        const confirmed = scan.confirmedPayments[0];
        if (confirmed) await markPaymentComplete(confirmed.referenceId, confirmed.provider, confirmed.transactionHash, confirmed.amount, confirmed.currency);
      } catch (error) {
        console.error('Chain payment status refresh failed', { referenceId, provider: payment.provider, message: error instanceof Error ? error.message : String(error) });
      }
    }
    [payment] = await db.select(fields).from(paymentRecords).where(eq(paymentRecords.id, payment.id)).limit(1);
    if (payment.status === 'pending' && payment.expiresAt && payment.expiresAt.getTime() + CRYPTO_RECONCILIATION_WINDOW_MS <= Date.now()) {
      const [expired] = await db.update(paymentRecords).set({ status: 'expired', updatedAt: new Date() }).where(and(eq(paymentRecords.id, payment.id), eq(paymentRecords.status, 'pending'))).returning({ id: paymentRecords.id });
      if (expired) payment = { ...payment, status: 'expired' };
    }
  }

  if (payment.status === 'paid' && payment.transactionHash) {
    try {
      await markPaymentComplete(referenceId, payment.provider, payment.transactionHash, payment.amount, payment.currency);
    } catch (error) {
      console.error('Chain payment fulfillment repair failed', { referenceId, provider: payment.provider, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return Response.json({ status: payment.status, confirmations: payment.confirmations ?? 0, requiredConfirmations: payment.requiredConfirmations ?? 1, transactionHash: payment.transactionHash }, { headers: { 'x-request-id': id, 'cache-control': 'no-store' } });
};
