import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addressTopic,
  BASE_USDC_CONTRACT,
  BASE_USDC_TRANSFER_TOPIC,
  formatUsdc,
  nextAvailableUsdcAmount,
  normalizeEvmAddress,
  parseRequiredConfirmations,
  parseUsdcLog,
  validateBaseRpcUrl,
} from '../src/server/base-usdc-core';

const recipient = '0x1234567890abcdef1234567890abcdef12345678';
const transactionHash = `0x${'ab'.repeat(32)}`;

function transferLog(overrides: Record<string, unknown> = {}) {
  return {
    address: BASE_USDC_CONTRACT,
    blockNumber: '0x1234',
    data: '0x12d687',
    removed: false,
    topics: [
      BASE_USDC_TRANSFER_TOPIC,
      addressTopic('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
      addressTopic(recipient),
    ],
    transactionHash,
    ...overrides,
  };
}

test('normalizes valid EVM addresses and rejects malformed addresses', () => {
  assert.equal(normalizeEvmAddress(`  ${recipient.toUpperCase().replace('0X', '0x')}  `), recipient);
  assert.throws(() => normalizeEvmAddress('0x1234'), /valid EVM wallet address/);
  assert.throws(() => normalizeEvmAddress(`0x${'g'.repeat(40)}`), /valid EVM wallet address/);
});

test('validates public HTTPS Base RPC URLs', () => {
  assert.equal(validateBaseRpcUrl(' https://mainnet.base.org/ '), 'https://mainnet.base.org');
  assert.equal(validateBaseRpcUrl('https://rpc.example.com/base?key=abc'), 'https://rpc.example.com/base?key=abc');
  assert.equal(validateBaseRpcUrl('https://fcoffee.example.com'), 'https://fcoffee.example.com');
  assert.throws(() => validateBaseRpcUrl('http://mainnet.base.org'), /must use HTTPS/);
  assert.throws(() => validateBaseRpcUrl('https://user:secret@example.com'), /must not contain URL credentials/);
  assert.throws(() => validateBaseRpcUrl('https://localhost:8545'), /public host/);
  assert.throws(() => validateBaseRpcUrl('https://192.168.1.1'), /public host/);
  assert.throws(() => validateBaseRpcUrl('https://[::1]'), /public host/);
  assert.throws(() => validateBaseRpcUrl('https://[fd00::1]'), /public host/);
  assert.throws(() => validateBaseRpcUrl('not a URL'), /valid Base RPC URL/);
});

test('requires an integer confirmation count between 1 and 100', () => {
  assert.equal(parseRequiredConfirmations('1'), 1);
  assert.equal(parseRequiredConfirmations(100), 100);
  for (const value of [0, 101, 1.5, 'invalid', null]) {
    assert.throws(() => parseRequiredConfirmations(value), /between 1 and 100/);
  }
});

test('encodes an EVM address as an indexed event topic', () => {
  assert.equal(addressTopic(recipient), `0x${'0'.repeat(24)}${recipient.slice(2)}`);
});

test('parses an official Base USDC transfer log', () => {
  assert.deepEqual(parseUsdcLog(transferLog()), {
    amount: 1_234_567,
    blockNumber: 0x1234,
    to: recipient,
    transactionHash,
  });
});

test('rejects removed and unrelated transfer logs', () => {
  assert.equal(parseUsdcLog(transferLog({ removed: true })), null);
  assert.equal(parseUsdcLog(transferLog({ address: '0x0000000000000000000000000000000000000001' })), null);
  assert.equal(parseUsdcLog(transferLog({ topics: [`0x${'00'.repeat(32)}`, addressTopic(recipient), addressTopic(recipient)] })), null);
  assert.equal(parseUsdcLog(transferLog({ transactionHash: '0x1234' })), null);
});

test('keeps concurrent USDC payment identifiers below a ten-cent premium', () => {
  assert.equal(nextAvailableUsdcAmount(1_000_000, []), 1_000_000);
  assert.equal(nextAvailableUsdcAmount(1_000_000, [1_000_000]), 1_001_000);
  assert.equal(
    nextAvailableUsdcAmount(1_000_000, Array.from({ length: 29 }, (_, offset) => 1_000_000 + offset * 1_000)),
    1_029_000,
  );
  assert.throws(
    () => nextAvailableUsdcAmount(1_000_000, Array.from({ length: 100 }, (_, offset) => 1_000_000 + offset * 1_000)),
    /Too many active Base USDC payments/,
  );
  assert.throws(() => nextAvailableUsdcAmount(0, []), /Invalid USDC amount/);
});

test('formats exact USDC amounts without insignificant trailing zeros', () => {
  assert.equal(formatUsdc(0), '0');
  assert.equal(formatUsdc(1), '0.000001');
  assert.equal(formatUsdc(1_234_567), '1.234567');
  assert.equal(formatUsdc(1_000_000), '1');
  assert.equal(formatUsdc(1_001_000), '1.001');
  assert.equal(formatUsdc(1_029_000), '1.029');
  assert.throws(() => formatUsdc(-1), /Invalid USDC amount/);
  assert.throws(() => formatUsdc(1.5), /Invalid USDC amount/);
});
