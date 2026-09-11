
import { and, asc, eq, gt, isNotNull } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorCryptoWallets, paymentRecords } from '../db/schema';
import { convertCurrency } from './exchange-rate';
import type { Currency } from './money';
import {
  addressTopic,
  BASE_CHAIN_ID,
  BASE_USDC_CONTRACT,
  BASE_USDC_PROVIDER,
  BASE_USDC_TRANSFER_TOPIC,
  nextAvailableUsdcAmount,
  normalizeEvmAddress,
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
  formatUsdc,
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

export async function createBaseUsdcQuote(input: { creatorId: number; amount: number; currency: Currency }) {
  const wallet = await getBaseUsdcWallet(input.creatorId);
  if (!wallet?.enabled) throw new Error('Base USDC payments are not configured.');
  const usd = input.currency === 'USD' ? { amount: input.amount, conversionRate: null } : await convertCurrency(input.amount, input.currency, 'USD');
  const baseAmount = usd.amount * 10_000;
  if (!Number.isSafeInteger(baseAmount) || baseAmount <= 0) throw new Error('Unable to calculate the USDC payment amount.');
  const db = createDb(env.DB);
  const now = new Date();
  const active = await db.select({ amount: paymentRecords.amount }).from(paymentRecords).where(and(eq(paymentRecords.provider, BASE_USDC_PROVIDER), eq(paymentRecords.status, 'pending'), eq(paymentRecords.walletAddress, wallet.address), gt(paymentRecords.expiresAt, now)));
  const amount = nextAvailableUsdcAmount(baseAmount, active.map((payment) => payment.amount));
  return { amount, wallet, conversionRate: usd.conversionRate };
}

export async function scanPendingBaseUsdcPayments() {
  const db = createDb(env.DB);
  const now = new Date();
  const confirmationGrace = new Date(now.getTime() - 10 * 60_000);
  const pending = await db.select().from(paymentRecords).where(and(eq(paymentRecords.provider, BASE_USDC_PROVIDER), eq(paymentRecords.status, 'pending'), isNotNull(paymentRecords.expiresAt), gt(paymentRecords.expiresAt, confirmationGrace))).orderBy(asc(paymentRecords.createdAt)).limit(200);
  if (!pending.length) return { candidates: 0, confirmedPayments: [], failedWallets: 0 };

  const creatorWallets = await db.select().from(creatorCryptoWallets).where(and(eq(creatorCryptoWallets.network, 'base'), eq(creatorCryptoWallets.asset, 'USDC'), eq(creatorCryptoWallets.enabled, true)));
  const wallets = new Map(creatorWallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));
  const confirmedPayments: Array<{ referenceId: string; transactionHash: string; amount: number }> = [];
  let failedWallets = 0;

  const groups = new Map<string, typeof pending>();
  for (const payment of pending) {
    if (!payment.walletAddress) continue;
    const address = payment.walletAddress.toLowerCase();
    groups.set(address, [...(groups.get(address) ?? []), payment]);
  }
  for (const [address, payments] of groups) {
    const wallet = wallets.get(address);
    if (!wallet) continue;
    try {
      const latestBlock = await rpc<number>(wallet.rpcUrl, 'eth_blockNumber', []).then((value) => parseHexInteger(value));
      if (latestBlock === null) throw new Error('Base RPC returned an invalid block number.');
      const oldest = Math.min(...payments.map((payment) => payment.createdAt.getTime()));
      const estimatedBlocks = Math.ceil((Date.now() - oldest) / 2_000) + 300;
      const logs = await rpc<BaseUsdcRpcLog[]>(wallet.rpcUrl, 'eth_getLogs', [{ address: BASE_USDC_CONTRACT, fromBlock: toHex(Math.max(0, latestBlock - estimatedBlocks)), toBlock: 'latest', topics: [BASE_USDC_TRANSFER_TOPIC, null, addressTopic(address)] }]);
      const parsed = logs.map(parseUsdcLog).filter((log): log is NonNullable<typeof log> => Boolean(log));
      const timestamps = new Map<number, number>();
      for (const payment of payments) {
        const match = parsed.find((log) => log.to === address && log.amount === payment.amount && (!payment.transactionHash || log.transactionHash === payment.transactionHash));
        if (!match) continue;
        let timestamp = timestamps.get(match.blockNumber);
        if (!timestamp) {
          const block = await rpc<RpcBlock>(wallet.rpcUrl, 'eth_getBlockByNumber', [toHex(match.blockNumber), false]);
          timestamp = parseHexInteger(block.timestamp) ?? 0;
          timestamps.set(match.blockNumber, timestamp);
        }
        const paidAt = timestamp * 1_000;
        if (paidAt < payment.createdAt.getTime() - 30_000 || paidAt > payment.expiresAt!.getTime()) continue;
        const confirmations = latestBlock - match.blockNumber + 1;
        await db.update(paymentRecords).set({ transactionHash: match.transactionHash, confirmations, updatedAt: new Date() }).where(eq(paymentRecords.id, payment.id));
        if (confirmations < (payment.requiredConfirmations ?? wallet.requiredConfirmations)) continue;
        confirmedPayments.push({ referenceId: payment.referenceId, transactionHash: match.transactionHash, amount: payment.amount });
      }
    } catch (error) {
      failedWallets += 1;
      console.error('Base USDC payment scan failed', { walletId: wallet.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { candidates: pending.length, confirmedPayments, failedWallets };
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
