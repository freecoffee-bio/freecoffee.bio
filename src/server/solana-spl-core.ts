import { isNonPublicHost } from './network-host';

export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
export const SOLANA_USDC_DECIMALS = 6;
export const SOLANA_USDT_DECIMALS = 6;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_VALUES = new Map(Array.from(BASE58_ALPHABET, (character, index) => [character, index]));

type TokenBalance = {
  accountIndex?: unknown;
  mint?: unknown;
  owner?: unknown;
  uiTokenAmount?: {
    amount?: unknown;
  };
};

type ParsedTransaction = {
  meta?: {
    err?: unknown;
    preTokenBalances?: unknown;
    postTokenBalances?: unknown;
  } | null;
};

export type SolanaCommitment = 'confirmed' | 'finalized';

export function decodeBase58(value: string): Uint8Array {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Invalid Base58 value.');

  const bytes: number[] = [0];
  for (const character of value) {
    const digit = BASE58_VALUES.get(character);
    if (digit === undefined) throw new Error('Invalid Base58 value.');

    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (let index = 0; index < value.length - 1 && value[index] === '1'; index += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

export function validateSolanaAddress(value: string): string {
  let decoded: Uint8Array;
  try {
    decoded = decodeBase58(value);
  } catch {
    throw new Error('Enter a valid Solana address.');
  }
  if (decoded.length !== 32) throw new Error('Enter a valid Solana address.');
  return value;
}

export function validateSolanaRpcUrl(value: string): string {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a valid Solana RPC URL.');
  }
  if (url.protocol !== 'https:') throw new Error('Solana RPC URL must use HTTPS.');
  if (url.username || url.password) throw new Error('Solana RPC URL must not contain URL credentials.');

  if (isNonPublicHost(url.hostname)) {
    throw new Error('Solana RPC URL must use a public host.');
  }
  return url.toString().replace(/\/$/, '');
}

export function parseSolanaCommitment(value: unknown): SolanaCommitment {
  const commitment = Number(value);
  if (!Number.isInteger(commitment)) throw new Error('Solana commitment must be 1 or 2.');
  if (commitment === 1) return 'confirmed';
  if (commitment === 2) return 'finalized';
  throw new Error('Solana commitment must be 1 or 2.');
}

export function calculateSplTokenNetInflow(transaction: unknown, owner: string, mint: string): number | null {
  if (!isRecord(transaction)) return null;
  const meta = (transaction as ParsedTransaction).meta;
  if (!meta || meta.err !== null) return null;
  if (!Array.isArray(meta.preTokenBalances) || !Array.isArray(meta.postTokenBalances)) return null;

  const balances = new Map<number, { amount: bigint; owners: Set<string> }>();
  if (!addTokenBalances(balances, meta.preTokenBalances, mint, -1n)) return null;
  if (!addTokenBalances(balances, meta.postTokenBalances, mint, 1n)) return null;

  let total = 0n;
  for (const balance of balances.values()) {
    if (!balance.owners.has(owner)) continue;
    if (balance.owners.size > 1) return null;
    total += balance.amount;
  }
  if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(total);
}

export function isSolanaPaymentWithinWindow(blockTimeSeconds: number, createdAtMs: number, expiresAtMs: number): boolean {
  if (![blockTimeSeconds, createdAtMs, expiresAtMs].every(Number.isSafeInteger)) return false;
  return blockTimeSeconds >= Math.floor(createdAtMs / 1_000)
    && blockTimeSeconds <= Math.floor(expiresAtMs / 1_000);
}

export function formatTokenUnits(units: number | bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Invalid token decimals.');
  const amount = typeof units === 'bigint'
    ? units
    : Number.isSafeInteger(units) ? BigInt(units) : null;
  if (amount === null || amount < 0n) throw new Error('Invalid token amount.');

  if (decimals === 0) return amount.toString();
  const padded = amount.toString().padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function buildSolanaPayUri(owner: string, mint: string, units: number | bigint, decimals: number): string {
  validateSolanaAddress(owner);
  validateSolanaAddress(mint);
  return `solana:${owner}?spl-token=${mint}&amount=${formatTokenUnits(units, decimals)}`;
}

function addTokenBalances(
  totals: Map<number, { amount: bigint; owners: Set<string> }>,
  balances: unknown[],
  mint: string,
  direction: bigint,
): boolean {
  for (const value of balances) {
    if (!isRecord(value)) continue;
    const balance = value as TokenBalance;
    if (balance.mint !== mint) continue;
    if (!Number.isSafeInteger(balance.accountIndex) || (balance.accountIndex as number) < 0) return false;
    if (!isRecord(balance.uiTokenAmount) || typeof balance.uiTokenAmount.amount !== 'string' || !/^(?:0|[1-9]\d*)$/.test(balance.uiTokenAmount.amount)) return false;

    const accountIndex = balance.accountIndex as number;
    const current = totals.get(accountIndex) ?? { amount: 0n, owners: new Set<string>() };
    current.amount += BigInt(balance.uiTokenAmount.amount) * direction;
    if (typeof balance.owner === 'string') current.owners.add(balance.owner);
    totals.set(accountIndex, current);
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
