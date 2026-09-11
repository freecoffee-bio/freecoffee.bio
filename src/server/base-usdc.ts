
import { and, asc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorCryptoWallets, paymentRecords } from '../db/schema';
import { reserveChainPaymentAmountSlot } from './chain-payment-slots';
import { createStablecoinQuote } from './exchange-rate';
import type { Currency } from './money';
import {
  addressTopic,
  BASE_CHAIN_ID,
  BASE_USDC_CONTRACT,
  BASE_USDC_PROVIDER,
  BASE_USDC_TRANSFER_TOPIC,
  CRYPTO_RECONCILIATION_WINDOW_MS,
  isUsdcPaymentWithinWindow,
  normalizeEvmAddress,
  usdcAmountCandidates,
  parseHexInteger,
  parseRequiredConfirmations,
  parseUsdcLog,
  validateBaseRpcUrl,
  type BaseUsdcRpcLog,
} from './base-usdc-core';

export {
  addressTopic,
  BASE_CHAIN_ID,
  BASE_USDC_CONTRACT,
  BASE_USDC_DECIMALS,
  BASE_USDC_PROVIDER,
  BASE_USDC_TRANSFER_TOPIC,
  CRYPTO_PAYMENT_WINDOW_MS,
  CRYPTO_RECONCILIATION_WINDOW_MS,
  formatUsdc,
  isUsdcPaymentWithinWindow,
  normalizeEvmAddress,
  parseRequiredConfirmations,
  parseUsdcLog,
  validateBaseRpcUrl,
} from './base-usdc-core';

export type BaseUsdcWallet = {
  id: string;
  creatorId: number;
  address: string;
  rpcUrl: string;
  requiredConfirmations: number;
  enabled: boolean;
};

type RpcBlock = { timestamp?: string };

export async function getBaseUsdcWallet(creatorId: number): Promise<BaseUsdcWallet | null> {
  const [wallet] = await createDb(env.DB).select().from(creatorCryptoWallets).where(and(eq(creatorCryptoWallets.creatorId, creatorId), eq(creatorCryptoWallets.network, 'base'), eq(creatorCryptoWallets.asset, 'USDC'))).limit(1);
  return wallet ?? null;
}

export async function saveBaseUsdcWallet(creatorId: number, input: { address: string; rpcUrl: string; requiredConfirmations: unknown }) {
  const db = createDb(env.DB);
  const address = normalizeEvmAddress(input.address);
  const rpcUrl = validateBaseRpcUrl(input.rpcUrl);
  const requiredConfirmations = parseRequiredConfirmations(input.requiredConfirmations);
  if (rpcUrl !== 'https://mainnet.base.org') await verifyBaseRpc(rpcUrl);
  const now = new Date();
  await db.insert(creatorCryptoWallets).values({ id: crypto.randomUUID(), creatorId, network: 'base', asset: 'USDC', address, rpcUrl, requiredConfirmations, enabled: true, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [creatorCryptoWallets.creatorId, creatorCryptoWallets.network, creatorCryptoWallets.asset], set: { address, rpcUrl, requiredConfirmations, enabled: true, updatedAt: now } });
}

export async function disableBaseUsdcWallet(creatorId: number) {
  await createDb(env.DB).update(creatorCryptoWallets).set({ enabled: false, updatedAt: new Date() }).where(and(eq(creatorCryptoWallets.creatorId, creatorId), eq(creatorCryptoWallets.network, 'base'), eq(creatorCryptoWallets.asset, 'USDC')));
}

export async function createBaseUsdcQuote(input: { creatorId: number; amount: number; currency: Currency; referenceId: string; createdAt: Date; expiresAt: Date }) {
  const wallet = await getBaseUsdcWallet(input.creatorId);
  if (!wallet?.enabled) throw new Error('Base USDC payments are not configured.');
  const quote = await createStablecoinQuote(input.amount, input.currency);
  const baseAmount = quote.basePaymentAmount;
  const amount = await reserveChainPaymentAmountSlot({
    network: 'base',
    asset: 'USDC',
    walletAddress: wallet.address,
    referenceId: input.referenceId,
    candidates: usdcAmountCandidates(baseAmount),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
  return { amount, wallet, settlementAmount: quote.settlementAmount, basePaymentAmount: baseAmount, conversionRate: quote.conversionRate, rate: quote.rate };
}

export async function scanPendingBaseUsdcPayments(referenceId?: string, rpcBudget = 20) {
  const db = createDb(env.DB);
  const now = new Date();
  const reconciliationCutoff = new Date(now.getTime() - CRYPTO_RECONCILIATION_WINDOW_MS);
  const pending = await db.select().from(paymentRecords).where(and(eq(paymentRecords.provider, BASE_USDC_PROVIDER), eq(paymentRecords.status, 'pending'), isNotNull(paymentRecords.expiresAt), gt(paymentRecords.expiresAt, reconciliationCutoff), referenceId ? eq(paymentRecords.referenceId, referenceId) : undefined)).orderBy(asc(paymentRecords.createdAt)).limit(referenceId ? 1 : 200);
  if (!pending.length) return { candidates: 0, confirmedPayments: [], failedWallets: 0, rpcRequests: 0, budgetExhausted: false };

  let rpcRequests = 0;
  let budgetExhausted = false;
  const budgetedRpc = async <T>(url: string, method: string, params: unknown[]): Promise<T> => {
    if (rpcRequests >= rpcBudget) {
      budgetExhausted = true;
      throw new Error('Base scan RPC budget exhausted.');
    }
    rpcRequests += 1;
    return rpc<T>(url, method, params);
  };

  const creatorWallets = await db.select().from(creatorCryptoWallets).where(and(eq(creatorCryptoWallets.network, 'base'), eq(creatorCryptoWallets.asset, 'USDC')));
  const wallets = new Map(creatorWallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));
  const fallbackWallet = creatorWallets[0];
  const confirmedPayments: Array<{ referenceId: string; transactionHash: string; amount: number }> = [];
  let failedWallets = 0;

  const groups = new Map<string, typeof pending>();
  for (const payment of pending) {
    if (!payment.walletAddress) continue;
    const address = payment.walletAddress.toLowerCase();
    groups.set(address, [...(groups.get(address) ?? []), payment]);
  }
  for (const [address, payments] of groups) {
    if (budgetExhausted) break;
    const wallet = wallets.get(address) ?? fallbackWallet;
    if (!wallet) continue;
    try {
      const latestBlock = await budgetedRpc<string>(wallet.rpcUrl, 'eth_blockNumber', []).then((value) => parseHexInteger(value));
      if (latestBlock === null) throw new Error('Base RPC returned an invalid block number.');
      const oldest = Math.min(...payments.map((payment) => payment.createdAt.getTime()));
      const estimatedBlocks = Math.ceil((Date.now() - oldest) / 2_000) + 300;
      const fromBlock = Math.max(0, latestBlock - estimatedBlocks);
      const logs: BaseUsdcRpcLog[] = [];
      for (let start = fromBlock; start <= latestBlock; start += 10_000) {
        const end = Math.min(latestBlock, start + 9_999);
        logs.push(...await budgetedRpc<BaseUsdcRpcLog[]>(wallet.rpcUrl, 'eth_getLogs', [{ address: BASE_USDC_CONTRACT, fromBlock: toHex(start), toBlock: toHex(end), topics: [BASE_USDC_TRANSFER_TOPIC, null, addressTopic(address)] }]));
      }
      const parsed = logs.map(parseUsdcLog).filter((log): log is NonNullable<typeof log> => Boolean(log));
      const transactionHashes = [...new Set(parsed.map((log) => log.transactionHash))];
      const claimed = transactionHashes.length
        ? await db.select({ transactionHash: paymentRecords.transactionHash }).from(paymentRecords).where(and(eq(paymentRecords.network, 'base'), inArray(paymentRecords.transactionHash, transactionHashes)))
        : [];
      const claimedHashes = new Set(claimed.flatMap((row) => row.transactionHash ? [row.transactionHash] : []));
      const timestamps = new Map<number, number>();
      const blockTimestamp = async (blockNumber: number) => {
        const cached = timestamps.get(blockNumber);
        if (cached) return cached;
        const block = await budgetedRpc<RpcBlock>(wallet.rpcUrl, 'eth_getBlockByNumber', [toHex(blockNumber), false]);
        const timestamp = parseHexInteger(block.timestamp) ?? 0;
        if (timestamp <= 0) throw new Error('Base RPC returned an invalid block timestamp.');
        timestamps.set(blockNumber, timestamp);
        return timestamp;
      };
      for (const payment of payments) {
        let candidates = parsed.filter((log) => log.to === address
          && log.amount === payment.amount
          && log.blockNumber <= latestBlock
          && (payment.transactionHash ? log.transactionHash === payment.transactionHash : !claimedHashes.has(log.transactionHash)));
        if (!candidates.length && payment.transactionHash) {
          await db.update(paymentRecords)
            .set({ transactionHash: null, confirmations: 0, updatedAt: new Date() })
            .where(and(eq(paymentRecords.id, payment.id), eq(paymentRecords.status, 'pending'), eq(paymentRecords.transactionHash, payment.transactionHash)));
          claimedHashes.delete(payment.transactionHash);
          candidates = parsed.filter((log) => log.to === address
            && log.amount === payment.amount
            && log.blockNumber <= latestBlock
            && !claimedHashes.has(log.transactionHash));
        }
        let match: (typeof parsed)[number] | undefined;
        for (const candidate of candidates) {
          const paidAt = await blockTimestamp(candidate.blockNumber) * 1_000;
          if (isUsdcPaymentWithinWindow(paidAt, payment.createdAt.getTime(), payment.expiresAt!.getTime())) {
            match = candidate;
            break;
          }
        }
        if (!match) continue;
        const confirmations = latestBlock - match.blockNumber + 1;
        try {
          const [reserved] = await db.update(paymentRecords)
            .set({ transactionHash: match.transactionHash, confirmations, updatedAt: new Date() })
            .where(and(eq(paymentRecords.id, payment.id), eq(paymentRecords.status, 'pending'), payment.transactionHash ? eq(paymentRecords.transactionHash, payment.transactionHash) : isNull(paymentRecords.transactionHash)))
            .returning({ id: paymentRecords.id });
          if (!reserved) continue;
        } catch (error) {
          if (isTransactionHashConflict(error)) continue;
          throw error;
        }
        claimedHashes.add(match.transactionHash);
        if (confirmations < (payment.requiredConfirmations ?? wallet.requiredConfirmations)) continue;
        confirmedPayments.push({ referenceId: payment.referenceId, transactionHash: match.transactionHash, amount: payment.amount });
      }
    } catch (error) {
      failedWallets += 1;
      console.error('Base USDC payment scan failed', { walletId: wallet.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { candidates: pending.length, confirmedPayments, failedWallets, rpcRequests, budgetExhausted };
}

async function verifyBaseRpc(rpcUrl: string) {
  const chainId = await rpc<string>(rpcUrl, 'eth_chainId', []);
  if (parseHexInteger(chainId) !== BASE_CHAIN_ID) throw new Error('RPC endpoint is not connected to Base mainnet.');
  await rpc<string>(rpcUrl, 'eth_blockNumber', []);
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }), signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Base RPC ${method} failed with status ${response.status}.`);
  let payload: { result?: T; error?: { message?: string } };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new Error(`Base RPC ${method} returned invalid JSON.`);
  }
  if (payload.error || payload.result === undefined) throw new Error(`Base RPC ${method} failed: ${payload.error?.message ?? 'missing result'}.`);
  return payload.result;
}

function toHex(value: number): string {
  return `0x${value.toString(16)}`;
}

function isTransactionHashConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('payment_records.network, payment_records.transaction_hash')
    || message.includes('payment_records_network_transaction_unique');
}
