import Big from 'big.js';
import { isNonPublicHost } from './network-host';

export const BASE_CHAIN_ID = 8453;
export const BASE_USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const BASE_USDC_PROVIDER = 'base-usdc';
export const BASE_USDC_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const BASE_USDC_DECIMALS = 6;
export const USDC_PAYMENT_INCREMENT_UNITS = 1_000;
export const USDC_PAYMENT_AMOUNT_SLOTS = 100;
export const CRYPTO_PAYMENT_WINDOW_MS = 20 * 60_000;
export const CRYPTO_RECONCILIATION_WINDOW_MS = 30 * 60_000;

export type BaseUsdcRpcLog = {
  address?: string;
  blockNumber?: string;
  data?: string;
  removed?: boolean;
  topics?: string[];
  transactionHash?: string;
};

export function normalizeEvmAddress(value: string): string {
  const address = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error('Enter a valid EVM wallet address.');
  return address;
}

export function validateBaseRpcUrl(value: string): string {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a valid Base RPC URL.');
  }
  if (url.protocol !== 'https:') throw new Error('Base RPC URL must use HTTPS.');
  if (url.username || url.password) throw new Error('Base RPC URL must not contain URL credentials.');
  if (isNonPublicHost(url.hostname)) throw new Error('Base RPC URL must use a public host.');
  return url.toString().replace(/\/$/, '');
}

export function parseRequiredConfirmations(value: unknown): number {
  const confirmations = Number(value);
  if (!Number.isSafeInteger(confirmations) || confirmations < 1 || confirmations > 100) throw new Error('Required confirmations must be between 1 and 100.');
  return confirmations;
}

export function addressTopic(address: string): string {
  return `0x${normalizeEvmAddress(address).slice(2).padStart(64, '0')}`;
}

export function parseUsdcLog(log: BaseUsdcRpcLog) {
  const topics = log.topics ?? [];
  if (log.removed || log.address?.toLowerCase() !== BASE_USDC_CONTRACT || topics[0]?.toLowerCase() !== BASE_USDC_TRANSFER_TOPIC || topics.length < 3) return null;
  const data = String(log.data ?? '');
  const blockNumber = parseHexInteger(log.blockNumber);
  if (!/^0x[0-9a-f]+$/i.test(data) || blockNumber === null || !/^0x[0-9a-f]{64}$/i.test(topics[2] ?? '') || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash ?? '')) return null;
  const amount = BigInt(data);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    amount: Number(amount),
    blockNumber,
    to: `0x${topics[2].slice(-40)}`.toLowerCase(),
    transactionHash: log.transactionHash!.toLowerCase(),
  };
}

export function isUsdcPaymentWithinWindow(paidAtMs: number, createdAtMs: number, expiresAtMs: number): boolean {
  if (![paidAtMs, createdAtMs, expiresAtMs].every(Number.isSafeInteger)) return false;
  const paidAt = Math.floor(paidAtMs / 1_000);
  return paidAt >= Math.floor(createdAtMs / 1_000)
    && paidAt <= Math.floor(expiresAtMs / 1_000);
}

export function usdcAmountCandidates(baseAmount: number): number[] {
  if (!Number.isSafeInteger(baseAmount) || baseAmount <= 0) throw new Error('Invalid USDC amount.');
  const amounts = Array.from({ length: USDC_PAYMENT_AMOUNT_SLOTS }, (_, offset) => baseAmount + offset * USDC_PAYMENT_INCREMENT_UNITS);
  if (amounts.some((amount) => !Number.isSafeInteger(amount))) throw new Error('USDC amount exceeds the supported range.');
  return amounts;
}

export function nextAvailableUsdcAmount(baseAmount: number, usedAmounts: Iterable<number>): number {
  const used = new Set(usedAmounts);
  const amount = usdcAmountCandidates(baseAmount).find((candidate) => !used.has(candidate));
  if (amount !== undefined) return amount;
  throw new Error('Too many active Base USDC payments. Please try again later.');
}

export function formatUsdc(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid USDC amount.');
  return new Big(amount)
    .div(new Big(10).pow(BASE_USDC_DECIMALS))
    .toFixed(BASE_USDC_DECIMALS)
    .replace(/\.?0+$/, '');
}

export function parseHexInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
