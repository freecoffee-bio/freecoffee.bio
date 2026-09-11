import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../../../db';
import { paymentRecords } from '../../../db/schema';
import { publicError, requestId } from '../../../server/http';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const referenceId = new URL(request.url).searchParams.get('reference')?.trim() ?? '';
  if (!referenceId || referenceId.length > 100) return publicError('Invalid payment reference.', 400, id);
  const [payment] = await createDb(env.DB).select({ status: paymentRecords.status, confirmations: paymentRecords.confirmations, requiredConfirmations: paymentRecords.requiredConfirmations, transactionHash: paymentRecords.transactionHash }).from(paymentRecords).where(and(eq(paymentRecords.referenceId, referenceId), eq(paymentRecords.provider, 'base-usdc'))).limit(1);
  if (!payment) return publicError('Payment not found.', 404, id);
  return Response.json({ status: payment.status, confirmations: payment.confirmations ?? 0, requiredConfirmations: payment.requiredConfirmations ?? 1, transactionHash: payment.transactionHash }, { headers: { 'x-request-id': id, 'cache-control': 'no-store' } });
};
