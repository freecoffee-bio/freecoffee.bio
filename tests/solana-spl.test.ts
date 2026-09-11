import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSolanaPayUri,
  calculateSplTokenNetInflow,
  decodeBase58,
  formatTokenUnits,
  isSolanaPaymentWithinWindow,
  parseSolanaCommitment,
  SOLANA_USDC_DECIMALS,
  SOLANA_USDC_MINT,
  SOLANA_USDT_DECIMALS,
  SOLANA_USDT_MINT,
  validateSolanaAddress,
  validateSolanaRpcUrl,
} from '../src/server/solana-spl-core';

const owner = '11111111111111111111111111111111';

function tokenBalance(accountIndex: number, balanceOwner: string, mint: string, amount: string) {
  return {
    accountIndex,
    mint,
    owner: balanceOwner,
    uiTokenAmount: { amount, decimals: 6, uiAmount: null, uiAmountString: 'ignored' },
  };
}

function transaction(preTokenBalances: unknown[], postTokenBalances: unknown[], err: unknown = null) {
  return { meta: { err, preTokenBalances, postTokenBalances } };
}

test('exports official Solana stablecoin mint constants', () => {
  assert.equal(SOLANA_USDC_MINT, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal(SOLANA_USDT_MINT, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
  assert.equal(SOLANA_USDC_DECIMALS, 6);
  assert.equal(SOLANA_USDT_DECIMALS, 6);
});

test('strictly decodes Base58 and validates 32-byte Solana addresses', () => {
  assert.equal(decodeBase58(owner).length, 32);
  assert.equal(validateSolanaAddress(owner), owner);
  assert.equal(validateSolanaAddress(SOLANA_USDC_MINT), SOLANA_USDC_MINT);
  assert.throws(() => decodeBase58(''), /Invalid Base58/);
  for (const invalid of ['0', 'O', 'I', 'l', 'abc-', 'abc def']) {
    assert.throws(() => decodeBase58(invalid), /Invalid Base58/);
  }
  assert.throws(() => validateSolanaAddress('1'.repeat(31)), /valid Solana address/);
  assert.throws(() => validateSolanaAddress('1'.repeat(33)), /valid Solana address/);
  assert.throws(() => validateSolanaAddress(` ${owner}`), /valid Solana address/);
});

test('validates public HTTPS Solana RPC URLs', () => {
  assert.equal(validateSolanaRpcUrl(' https://api.mainnet-beta.solana.com/ '), 'https://api.mainnet-beta.solana.com');
  assert.equal(validateSolanaRpcUrl('https://rpc.example.com/solana?key=abc'), 'https://rpc.example.com/solana?key=abc');
  assert.throws(() => validateSolanaRpcUrl('http://api.mainnet-beta.solana.com'), /must use HTTPS/);
  assert.throws(() => validateSolanaRpcUrl('https://user:secret@example.com'), /credentials/);
  for (const url of [
    'https://localhost',
    'https://rpc.localhost',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://172.31.255.255',
    'https://192.168.1.1',
    'https://169.254.1.1',
    'https://100.64.0.1',
    'https://[::1]',
    'https://[fd00::1]',
    'https://[fe80::1]',
    'https://[::ffff:127.0.0.1]',
  ]) {
    assert.throws(() => validateSolanaRpcUrl(url), /public host/);
  }
  assert.throws(() => validateSolanaRpcUrl('not a URL'), /valid Solana RPC URL/);
});

test('maps the integer commitment field', () => {
  assert.equal(parseSolanaCommitment(1), 'confirmed');
  assert.equal(parseSolanaCommitment('2'), 'finalized');
  for (const value of [0, 3, 1.5, 'confirmed', null, undefined]) {
    assert.throws(() => parseSolanaCommitment(value), /must be 1 or 2/);
  }
});

test('aggregates SPL token net inflow by account index for owner and mint', () => {
  const otherOwner = SOLANA_USDT_MINT;
  const result = calculateSplTokenNetInflow(
    transaction(
      [
        tokenBalance(1, owner, SOLANA_USDC_MINT, '1000000'),
        tokenBalance(2, owner, SOLANA_USDC_MINT, '2500000'),
        tokenBalance(3, otherOwner, SOLANA_USDC_MINT, '9000000'),
        tokenBalance(4, owner, SOLANA_USDT_MINT, '9000000'),
      ],
      [
        tokenBalance(1, owner, SOLANA_USDC_MINT, '1750000'),
        tokenBalance(2, owner, SOLANA_USDC_MINT, '2250000'),
        tokenBalance(5, owner, SOLANA_USDC_MINT, '500000'),
        tokenBalance(3, otherOwner, SOLANA_USDC_MINT, '1'),
      ],
    ),
    owner,
    SOLANA_USDC_MINT,
  );
  assert.equal(result, 1_000_000);
});

test('handles closed accounts, outflows, duplicate indexes, and malformed balances safely', () => {
  const postWithoutOwner = tokenBalance(8, owner, SOLANA_USDC_MINT, '25');
  delete (postWithoutOwner as { owner?: string }).owner;
  assert.equal(calculateSplTokenNetInflow(
    transaction([tokenBalance(8, owner, SOLANA_USDC_MINT, '10')], [postWithoutOwner]),
    owner,
    SOLANA_USDC_MINT,
  ), 15);
  assert.equal(calculateSplTokenNetInflow(
    transaction([tokenBalance(9, owner, SOLANA_USDC_MINT, '10')], [tokenBalance(9, SOLANA_USDT_MINT, SOLANA_USDC_MINT, '25')]),
    owner,
    SOLANA_USDC_MINT,
  ), null);
  assert.equal(calculateSplTokenNetInflow(
    transaction([tokenBalance(7, owner, SOLANA_USDC_MINT, '10')], []),
    owner,
    SOLANA_USDC_MINT,
  ), -10);
  assert.equal(calculateSplTokenNetInflow(
    transaction(
      [tokenBalance(1, owner, SOLANA_USDC_MINT, '5'), tokenBalance(1, owner, SOLANA_USDC_MINT, '7')],
      [tokenBalance(1, owner, SOLANA_USDC_MINT, '20')],
    ),
    owner,
    SOLANA_USDC_MINT,
  ), 8);
  assert.equal(calculateSplTokenNetInflow(
    transaction([], [tokenBalance(1, owner, SOLANA_USDC_MINT, String(Number.MAX_SAFE_INTEGER + 1))]),
    owner,
    SOLANA_USDC_MINT,
  ), null);
  assert.equal(calculateSplTokenNetInflow(
    transaction([], [tokenBalance(1, owner, SOLANA_USDC_MINT, '1.5')]),
    owner,
    SOLANA_USDC_MINT,
  ), null);
  assert.equal(calculateSplTokenNetInflow(transaction([], [], { InstructionError: [0, 'Custom'] }), owner, SOLANA_USDC_MINT), null);
  assert.equal(calculateSplTokenNetInflow({ meta: null }, owner, SOLANA_USDC_MINT), null);
});

test('uses a closed interval at whole-second precision', () => {
  const createdAt = 1_000_999;
  const expiresAt = 2_000_001;
  assert.equal(isSolanaPaymentWithinWindow(1_000, createdAt, expiresAt), true);
  assert.equal(isSolanaPaymentWithinWindow(2_000, createdAt, expiresAt), true);
  assert.equal(isSolanaPaymentWithinWindow(999, createdAt, expiresAt), false);
  assert.equal(isSolanaPaymentWithinWindow(2_001, createdAt, expiresAt), false);
  assert.equal(isSolanaPaymentWithinWindow(1_000.5, createdAt, expiresAt), false);
});

test('formats token units exactly and builds Solana Pay URIs', () => {
  assert.equal(formatTokenUnits(0, 6), '0');
  assert.equal(formatTokenUnits(1, 6), '0.000001');
  assert.equal(formatTokenUnits(1_230_000, 6), '1.23');
  assert.equal(formatTokenUnits(1_000_000n, 6), '1');
  assert.equal(formatTokenUnits(42, 0), '42');
  assert.throws(() => formatTokenUnits(-1, 6), /Invalid token amount/);
  assert.throws(() => formatTokenUnits(1.5, 6), /Invalid token amount/);
  assert.throws(() => formatTokenUnits(1, -1), /Invalid token decimals/);
  assert.equal(
    buildSolanaPayUri(owner, SOLANA_USDC_MINT, 1_230_000, SOLANA_USDC_DECIMALS),
    `solana:${owner}?spl-token=${SOLANA_USDC_MINT}&amount=1.23`,
  );
});
