import { and, eq, lte } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { chainPaymentAmountSlots } from '../db/schema';

export type ChainPaymentSlotScope = {
  network: string;
  asset: string;
  walletAddress: string;
};

export async function reserveChainPaymentAmountSlot(input: ChainPaymentSlotScope & {
  referenceId: string;
  candidates: readonly number[];
  createdAt: Date;
  expiresAt: Date;
}): Promise<number> {
  const db = createDb(env.DB);
  await db.delete(chainPaymentAmountSlots).where(lte(chainPaymentAmountSlots.expiresAt, input.createdAt));
  const scope = and(
    eq(chainPaymentAmountSlots.network, input.network),
    eq(chainPaymentAmountSlots.asset, input.asset),
    eq(chainPaymentAmountSlots.walletAddress, input.walletAddress),
  );
  const occupied = await db.select({ amount: chainPaymentAmountSlots.amount }).from(chainPaymentAmountSlots).where(scope);
  const occupiedAmounts = new Set(occupied.map((slot) => slot.amount));
  for (const amount of input.candidates) {
    if (occupiedAmounts.has(amount)) continue;
    const reserved = await db.insert(chainPaymentAmountSlots).values({
      id: crypto.randomUUID(),
      network: input.network,
      asset: input.asset,
      walletAddress: input.walletAddress,
      amount,
      referenceId: input.referenceId,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt,
    }).onConflictDoNothing().returning({ id: chainPaymentAmountSlots.id });
    if (reserved.length) return amount;
  }
  throw new Error('Too many active chain payments. Please try again later.');
}

export async function releaseChainPaymentAmountSlot(referenceId: string) {
  await createDb(env.DB).delete(chainPaymentAmountSlots).where(eq(chainPaymentAmountSlots.referenceId, referenceId));
}
