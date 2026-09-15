import { and, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import { creatorCryptoWallets } from '../db/schema';
import type { RateSnapshot } from './exchange-rate';
import type { Currency } from './money';
import { BASE_USDC_PROVIDER, createBaseUsdcQuote, scanPendingBaseUsdcPayments } from './base-usdc';
import { buildSolanaPayUri, formatTokenUnits, SOLANA_USDC_DECIMALS, SOLANA_USDC_MINT, SOLANA_USDT_DECIMALS, SOLANA_USDT_MINT } from './solana-spl-core';
import { createSolanaQuote, scanPendingSolanaPayments, SOLANA_PROVIDERS, type SolanaPaymentProvider } from './solana-spl';

export const CHAIN_PAYMENT_PROVIDERS = [BASE_USDC_PROVIDER, ...SOLANA_PROVIDERS] as const;
export type ChainPaymentProvider = typeof CHAIN_PAYMENT_PROVIDERS[number];

export type ChainPaymentQuote = {
  provider: ChainPaymentProvider;
  network: 'base' | 'solana';
  asset: 'USDC' | 'USDT';
  amount: number;
  settlementAmount: number;
  basePaymentAmount: number;
  conversionRate: string | null;
  rate: RateSnapshot | null;
  wallet: { address: string; rpcUrl: string; requiredConfirmations: number; enabled: boolean };
};

export function isChainPaymentProvider(value: unknown): value is ChainPaymentProvider {
  return typeof value === 'string' && (CHAIN_PAYMENT_PROVIDERS as readonly string[]).includes(value);
}

export function chainPaymentDescriptor(provider: ChainPaymentProvider) {
  if (provider === BASE_USDC_PROVIDER) return { provider, network: 'base' as const, networkLabel: 'Base mainnet', asset: 'USDC' as const, decimals: 6, mintOrContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' };
  if (provider === 'solana-usdc') return { provider, network: 'solana' as const, networkLabel: 'Solana mainnet', asset: 'USDC' as const, decimals: SOLANA_USDC_DECIMALS, mintOrContract: SOLANA_USDC_MINT };
  return { provider, network: 'solana' as const, networkLabel: 'Solana mainnet', asset: 'USDT' as const, decimals: SOLANA_USDT_DECIMALS, mintOrContract: SOLANA_USDT_MINT };
}

export async function createChainPaymentQuote(input: { provider: ChainPaymentProvider; creatorId: number; amount: number; currency: Currency; referenceId: string; createdAt: Date; expiresAt: Date }): Promise<ChainPaymentQuote> {
  if (input.provider === BASE_USDC_PROVIDER) {
    const quote = await createBaseUsdcQuote(input);
    return { ...quote, provider: BASE_USDC_PROVIDER, network: 'base', asset: 'USDC' };
  }
  return createSolanaQuote({ ...input, provider: input.provider as SolanaPaymentProvider });
}

export async function scanPendingChainPayments(referenceId?: string, provider?: ChainPaymentProvider) {
  if (provider === BASE_USDC_PROVIDER) {
    const result = await scanPendingBaseUsdcPayments(referenceId, 40);
    return { ...result, confirmedPayments: result.confirmedPayments.map((payment) => ({ ...payment, provider: BASE_USDC_PROVIDER, currency: 'USDC' as const })) };
  }
  if (provider) return scanPendingSolanaPayments(referenceId, provider, 40);
  const base = await scanPendingBaseUsdcPayments(referenceId, 15);
  const solana = await scanPendingSolanaPayments(referenceId, undefined, 25);
  return {
    candidates: base.candidates + solana.candidates,
    confirmedPayments: [
      ...base.confirmedPayments.map((payment) => ({ ...payment, provider: BASE_USDC_PROVIDER, currency: 'USDC' as const })),
      ...solana.confirmedPayments,
    ],
    failedWallets: base.failedWallets + solana.failedWallets,
    rpcRequests: base.rpcRequests + solana.rpcRequests,
    budgetExhausted: base.budgetExhausted || solana.budgetExhausted,
  };
}

export async function getEnabledChainProviders(creatorId: number): Promise<Record<ChainPaymentProvider, boolean>> {
  const wallets = await createDb(env.DB).select({ network: creatorCryptoWallets.network, asset: creatorCryptoWallets.asset, enabled: creatorCryptoWallets.enabled }).from(creatorCryptoWallets).where(and(eq(creatorCryptoWallets.creatorId, creatorId), eq(creatorCryptoWallets.enabled, true)));
  const enabled = new Set(wallets.map((wallet) => `${wallet.network}:${wallet.asset}`));
  return {
    'base-usdc': enabled.has('base:USDC'),
    'solana-usdc': enabled.has('solana:USDC'),
    'solana-usdt': enabled.has('solana:USDT'),
  };
}

export function formatChainPaymentAmount(amount: number, provider: ChainPaymentProvider): string {
  return formatTokenUnits(amount, chainPaymentDescriptor(provider).decimals);
}

export function buildChainPaymentUri(provider: ChainPaymentProvider, walletAddress: string, amount: number): string {
  const descriptor = chainPaymentDescriptor(provider);
  if (descriptor.network === 'base') return `ethereum:${descriptor.mintOrContract}@8453/transfer?address=${encodeURIComponent(walletAddress)}&uint256=${amount}`;
  return buildSolanaPayUri(walletAddress, descriptor.mintOrContract, amount, descriptor.decimals);
}
