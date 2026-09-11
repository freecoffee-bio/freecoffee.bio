import { and, asc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorCryptoWallets, paymentRecords } from '../db/schema';
import { reserveChainPaymentAmountSlot } from './chain-payment-slots';
import { createStablecoinQuote } from './exchange-rate';
import type { Currency } from './money';
import { CRYPTO_RECONCILIATION_WINDOW_MS, usdcAmountCandidates } from './base-usdc-core';
import {
  calculateSplTokenNetInflow,
  isSolanaPaymentWithinWindow,
  parseSolanaCommitment,
  SOLANA_USDC_MINT,
  SOLANA_USDT_MINT,
  validateSolanaAddress,
  validateSolanaRpcUrl,
  type SolanaCommitment,
} from './solana-spl-core';

export const SOLANA_PROVIDERS = ['solana-usdc', 'solana-usdt'] as const;
export type SolanaPaymentProvider = typeof SOLANA_PROVIDERS[number];
export const SOLANA_MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const DEFAULT_SOLANA_SCAN_RPC_BUDGET = 20;
const MAX_SOLANA_TOKEN_ACCOUNTS = 8;
const SOLANA_SIGNATURE_LIMIT = 100;

type SolanaAsset = 'USDC' | 'USDT';
type SignatureInfo = { blockTime?: number | null; confirmationStatus?: string | null; err?: unknown; signature?: string };
type TokenAccounts = { value?: Array<{ pubkey?: string }> };
type Wallet = typeof creatorCryptoWallets.$inferSelect;

const assetConfig: Record<SolanaAsset, { mint: string; provider: SolanaPaymentProvider }> = {
  USDC: { mint: SOLANA_USDC_MINT, provider: 'solana-usdc' },
  USDT: { mint: SOLANA_USDT_MINT, provider: 'solana-usdt' },
};

export function solanaProviderAsset(provider: string): SolanaAsset | null {
  if (provider === 'solana-usdc') return 'USDC';
  if (provider === 'solana-usdt') return 'USDT';
  return null;
}

export async function getSolanaWallet(creatorId: number, asset: SolanaAsset): Promise<Wallet | null> {
  const [wallet] = await createDb(env.DB).select().from(creatorCryptoWallets).where(and(
    eq(creatorCryptoWallets.creatorId, creatorId),
    eq(creatorCryptoWallets.network, 'solana'),
    eq(creatorCryptoWallets.asset, asset),
  )).limit(1);
  return wallet ?? null;
}

export async function saveSolanaWallet(creatorId: number, addresses: Record<SolanaAsset, string>, input: { rpcUrl: string; requiredConfirmations: unknown }) {
  const validatedAddresses = {
    USDC: validateSolanaAddress(addresses.USDC.trim()),
    USDT: validateSolanaAddress(addresses.USDT.trim()),
  };
  const rpcUrl = validateSolanaRpcUrl(input.rpcUrl);
  const commitment = parseSolanaCommitment(input.requiredConfirmations);
  await Promise.all((Object.keys(validatedAddresses) as SolanaAsset[]).map((asset) => verifySolanaRpc(rpcUrl, validatedAddresses[asset], assetConfig[asset].mint, commitment)));
  const requiredConfirmations = commitment === 'finalized' ? 2 : 1;
  const now = new Date();
  const db = createDb(env.DB);
  const upsert = (asset: SolanaAsset) => db.insert(creatorCryptoWallets).values({
    id: crypto.randomUUID(), creatorId, network: 'solana', asset, address: validatedAddresses[asset], rpcUrl,
    requiredConfirmations, enabled: true, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [creatorCryptoWallets.creatorId, creatorCryptoWallets.network, creatorCryptoWallets.asset],
    set: { address: validatedAddresses[asset], rpcUrl, requiredConfirmations, enabled: true, updatedAt: now },
  });
  await db.batch([upsert('USDC'), upsert('USDT')]);
}

export async function disableSolanaWallet(creatorId: number, asset: SolanaAsset) {
  await createDb(env.DB).update(creatorCryptoWallets).set({ enabled: false, updatedAt: new Date() }).where(and(
    eq(creatorCryptoWallets.creatorId, creatorId),
    eq(creatorCryptoWallets.network, 'solana'),
    eq(creatorCryptoWallets.asset, asset),
  ));
}

export async function createSolanaQuote(input: { provider: SolanaPaymentProvider; creatorId: number; amount: number; currency: Currency; referenceId: string; createdAt: Date; expiresAt: Date }) {
  const asset = solanaProviderAsset(input.provider)!;
  const wallet = await getSolanaWallet(input.creatorId, asset);
  if (!wallet?.enabled) throw new Error(`Solana ${asset} payments are not configured.`);
  const quote = await createStablecoinQuote(input.amount, input.currency);
  const baseAmount = quote.basePaymentAmount;
  const amount = await reserveChainPaymentAmountSlot({
    network: 'solana', asset, walletAddress: wallet.address, referenceId: input.referenceId,
    candidates: usdcAmountCandidates(baseAmount), createdAt: input.createdAt, expiresAt: input.expiresAt,
  });
  return { amount, wallet, settlementAmount: quote.settlementAmount, basePaymentAmount: baseAmount, conversionRate: quote.conversionRate, rate: quote.rate, network: 'solana' as const, asset, provider: input.provider };
}

export async function scanPendingSolanaPayments(referenceId?: string, provider?: SolanaPaymentProvider, rpcBudget = DEFAULT_SOLANA_SCAN_RPC_BUDGET) {
  const db = createDb(env.DB);
  const reconciliationCutoff = new Date(Date.now() - CRYPTO_RECONCILIATION_WINDOW_MS);
  const pending = await db.select().from(paymentRecords).where(and(
    provider ? eq(paymentRecords.provider, provider) : inArray(paymentRecords.provider, [...SOLANA_PROVIDERS]),
    eq(paymentRecords.status, 'pending'),
    isNotNull(paymentRecords.expiresAt),
    gt(paymentRecords.expiresAt, reconciliationCutoff),
    referenceId ? eq(paymentRecords.referenceId, referenceId) : undefined,
  )).orderBy(asc(paymentRecords.createdAt)).limit(referenceId ? 1 : 100);
  if (!pending.length) return { candidates: 0, confirmedPayments: [], failedWallets: 0, rpcRequests: 0, budgetExhausted: false };

  let rpcRequests = 0;
  let budgetExhausted = false;
  const rpc = async <T>(url: string, method: string, params: unknown[]): Promise<T> => {
    if (rpcRequests >= rpcBudget) {
      budgetExhausted = true;
      throw new Error('Solana scan RPC budget exhausted.');
    }
    rpcRequests += 1;
    return solanaRpc<T>(url, method, params);
  };
  const wallets = await db.select().from(creatorCryptoWallets).where(eq(creatorCryptoWallets.network, 'solana'));
  const walletByScope = new Map(wallets.map((wallet) => [`${wallet.asset}:${wallet.address}`, wallet]));
  const walletByAsset = new Map(wallets.map((wallet) => [wallet.asset, wallet]));
  const groups = new Map<string, typeof pending>();
  for (const payment of pending) {
    if (!payment.walletAddress || !payment.asset) continue;
    const key = `${payment.asset}:${payment.walletAddress}`;
    groups.set(key, [...(groups.get(key) ?? []), payment]);
  }

  const confirmedPayments: Array<{ referenceId: string; provider: SolanaPaymentProvider; transactionHash: string; amount: number; currency: SolanaAsset }> = [];
  let failedWallets = 0;
  for (const [scope, payments] of groups) {
    if (budgetExhausted) break;
    const asset = payments[0]?.asset as SolanaAsset | undefined;
    if (!asset || !assetConfig[asset]) continue;
    const wallet = walletByScope.get(scope) ?? walletByAsset.get(asset);
    const recipientAddress = payments[0]?.walletAddress;
    if (!wallet || !recipientAddress) continue;
    const commitment = parseSolanaCommitment(wallet.requiredConfirmations);
    try {
      const accounts = await rpc<TokenAccounts>(wallet.rpcUrl, 'getTokenAccountsByOwner', [recipientAddress, { mint: assetConfig[asset].mint }, { commitment, encoding: 'jsonParsed' }]);
      const tokenAccounts = (accounts.value ?? [])
              .map((row) => row.pubkey)
              .filter((value): value is string => Boolean(value))
              .slice(0, MAX_SOLANA_TOKEN_ACCOUNTS);
      const signatures: SignatureInfo[] = [];
      for (const account of tokenAccounts) {
        signatures.push(...await rpc<SignatureInfo[]>(wallet.rpcUrl, 'getSignaturesForAddress', [account, { commitment, limit: SOLANA_SIGNATURE_LIMIT }]));
      }
      const uniqueSignatures = [...new Map(signatures.filter((row) => row.signature && row.err == null).map((row) => [row.signature!, row])).values()];
      const hashes = uniqueSignatures.map((row) => row.signature!);
      const claimed = hashes.length ? await db.select({ transactionHash: paymentRecords.transactionHash }).from(paymentRecords).where(and(eq(paymentRecords.network, 'solana'), inArray(paymentRecords.transactionHash, hashes))) : [];
      const claimedHashes = new Set(claimed.flatMap((row) => row.transactionHash ? [row.transactionHash] : []));
      const transactions = new Map<string, unknown>();
      for (const payment of payments) {
        const candidates = uniqueSignatures.filter((row) => row.blockTime
          && isCommitmentSatisfied(row.confirmationStatus, commitment)
          && isSolanaPaymentWithinWindow(row.blockTime, payment.createdAt.getTime(), payment.expiresAt!.getTime())
          && (payment.transactionHash ? row.signature === payment.transactionHash : !claimedHashes.has(row.signature!)));
        let match: SignatureInfo | undefined;
        for (const candidate of candidates) {
          const signature = candidate.signature!;
          let transaction = transactions.get(signature);
          if (!transaction) {
            transaction = await rpc<unknown>(wallet.rpcUrl, 'getTransaction', [signature, { commitment, encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
            transactions.set(signature, transaction);
          }
          if (calculateSplTokenNetInflow(transaction, recipientAddress, assetConfig[asset].mint) === payment.amount) {
            match = candidate;
            break;
          }
        }
        if (!match?.signature) continue;
        const confirmations = match.confirmationStatus === 'finalized' ? 2 : 1;
        try {
          const [reserved] = await db.update(paymentRecords).set({ transactionHash: match.signature, confirmations, updatedAt: new Date() }).where(and(
            eq(paymentRecords.id, payment.id), eq(paymentRecords.status, 'pending'),
            payment.transactionHash ? eq(paymentRecords.transactionHash, payment.transactionHash) : isNull(paymentRecords.transactionHash),
          )).returning({ id: paymentRecords.id });
          if (!reserved) continue;
        } catch (error) {
          if (isTransactionHashConflict(error)) continue;
          throw error;
        }
        claimedHashes.add(match.signature);
        if (confirmations >= (payment.requiredConfirmations ?? wallet.requiredConfirmations)) confirmedPayments.push({
          referenceId: payment.referenceId, provider: assetConfig[asset].provider, transactionHash: match.signature,
          amount: payment.amount, currency: asset,
        });
      }
    } catch (error) {
      failedWallets += 1;
      console.error('Solana stablecoin payment scan failed', { walletId: wallet.id, asset, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { candidates: pending.length, confirmedPayments, failedWallets, rpcRequests, budgetExhausted };
}

async function verifySolanaRpc(rpcUrl: string, owner: string, mint: string, commitment: SolanaCommitment) {
  const genesisHash = await solanaRpc<string>(rpcUrl, 'getGenesisHash', []);
  if (genesisHash !== SOLANA_MAINNET_GENESIS_HASH) throw new Error('RPC endpoint is not connected to Solana mainnet.');
  await solanaRpc<TokenAccounts>(rpcUrl, 'getTokenAccountsByOwner', [owner, { mint }, { commitment, encoding: 'jsonParsed' }]);
}

async function solanaRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }), signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Solana RPC ${method} failed with status ${response.status}.`);
  let payload: { result?: T; error?: { message?: string } };
  try { payload = JSON.parse(text) as typeof payload; } catch { throw new Error(`Solana RPC ${method} returned invalid JSON.`); }
  if (payload.error || payload.result === undefined) throw new Error(`Solana RPC ${method} failed: ${payload.error?.message ?? 'missing result'}.`);
  return payload.result;
}

function isCommitmentSatisfied(status: string | null | undefined, commitment: SolanaCommitment): boolean {
  return status === 'finalized' || commitment === 'confirmed' && status === 'confirmed';
}

function isTransactionHashConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('payment_records.network, payment_records.transaction_hash') || message.includes('payment_records_network_transaction_unique');
}
