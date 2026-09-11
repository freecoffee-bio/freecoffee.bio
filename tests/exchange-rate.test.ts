import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXCHANGE_RATE_MAX_AGE_MS,
  EXCHANGE_RATE_SYNC_INTERVAL_MS,
  parseExchangeRateResponse,
  stablecoinQuoteFromUsdRate,
} from '../src/server/exchange-rate-core';

test('parses the required USD exchange rates and source timestamp', () => {
  const now = new Date('2026-09-12T01:00:00.000Z');
  const snapshot = parseExchangeRateResponse({
    result: 'success',
    time_last_update_unix: 1_789_171_200,
    rates: { CNY: 7.2, EUR: 0.92, GBP: 0.79, JPY: 150 },
  }, now);
  assert.deepEqual(snapshot.rates, { CNY: '7.2', EUR: '0.92', GBP: '0.79', JPY: '150' });
  assert.equal(snapshot.effectiveAt.toISOString(), '2026-09-12T00:00:00.000Z');
});

test('rejects incomplete and invalid exchange rate responses', () => {
  assert.throws(() => parseExchangeRateResponse({ result: 'error' }), /invalid response/);
  assert.throws(() => parseExchangeRateResponse({ result: 'success', time_last_update_unix: 1, rates: { CNY: 7.2 } }), /valid EUR rate/);
  assert.throws(() => parseExchangeRateResponse({ result: 'success', time_last_update_unix: 0, rates: { CNY: 7.2, EUR: 0.92, GBP: 0.79, JPY: 150 } }), /valid update time/);
  assert.throws(() => parseExchangeRateResponse({ result: 'success', time_last_update_unix: 1, rates: { CNY: 7.2, EUR: 0.92, GBP: 0.79, JPY: 150 } }), /stale update time/);
});

test('uses hourly synchronization attempts and a 48-hour quote limit', () => {
  assert.equal(EXCHANGE_RATE_SYNC_INTERVAL_MS, 60 * 60_000);
  assert.equal(EXCHANGE_RATE_MAX_AGE_MS, 48 * 60 * 60_000);
});

test('rounds stablecoin quotes up to one thousandth without first rounding USD cents', () => {
  assert.deepEqual(stablecoinQuoteFromUsdRate(1_000, 2, '7.2'), {
    settlementAmount: 139,
    basePaymentAmount: 1_389_000,
  });
  assert.deepEqual(stablecoinQuoteFromUsdRate(100, 2, '1'), {
    settlementAmount: 100,
    basePaymentAmount: 1_000_000,
  });
});

test('supports zero-decimal source currencies and rejects invalid rates', () => {
  assert.deepEqual(stablecoinQuoteFromUsdRate(150, 0, '150'), {
    settlementAmount: 100,
    basePaymentAmount: 1_000_000,
  });
  assert.throws(() => stablecoinQuoteFromUsdRate(100, 2, '0'), /Invalid exchange rate/);
});
