import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPaymentProviderConfig,
  mergePaymentProviderConfig,
  parsePaymentProviders,
  validatePaymentCredentials,
} from '../src/server/payment-config';
import {
  buildPayPalCheckoutPayload,
  buildStripeCheckoutPayload,
  paypalApiBase,
} from '../src/server/payment-payloads';
import { normalizeSiteUrl } from '../src/server/site-url';

const input = {
  referenceId: 'order_123',
  amount: 1250,
  currency: 'USD' as const,
  description: 'Coffee support',
  returnUrl: 'https://example.com/shop/success?reference=order_123',
  cancelUrl: 'https://example.com/creator',
};

test('parses payment provider JSON into validated objects', () => {
  const providers = parsePaymentProviders(JSON.stringify({
    stripe: { credentials: { secretKey: ' sk_test ' }, options: {} },
    paypal: { credentials: { clientId: 'client' }, options: { sandbox: true } },
  }));

  assert.equal(providers.stripe.credentials.secretKey, ' sk_test ');
  assert.equal(providers.paypal.options.sandbox, true);
  assert.deepEqual(parsePaymentProviders('{invalid'), {});
  assert.deepEqual(parsePaymentProviders('[]'), {});
});

test('keeps providers isolated when one provider is updated', () => {
  const initial = JSON.stringify({
    stripe: { credentials: { secretKey: 'stripe-key' }, options: { mode: 'live' } },
    paypal: { credentials: { clientId: 'paypal-client' }, options: { sandbox: true } },
  });
  const afterStripe = mergePaymentProviderConfig(initial, 'stripe', { secretKey: 'new-stripe-key' });
  const afterPayPal = mergePaymentProviderConfig(afterStripe, 'paypal', { clientId: 'new-paypal-client' }, { sandbox: false });

  const stripe = parsePaymentProviders(afterPayPal).stripe;
  const paypal = parsePaymentProviders(afterPayPal).paypal;
  assert.equal(stripe.credentials.secretKey, 'new-stripe-key');
  assert.equal(stripe.options.mode, 'live');
  assert.equal(paypal.credentials.clientId, 'new-paypal-client');
  assert.equal(paypal.options.sandbox, false);
});

test('validates and trims non-empty credentials', () => {
  assert.deepEqual(validatePaymentCredentials({ ' clientId ': ' value ' }), { clientId: 'value' });
  assert.throws(() => validatePaymentCredentials({}), /cannot be empty/);
  assert.throws(() => validatePaymentCredentials({ clientId: '   ' }), /cannot be empty/);
  assert.throws(() => validatePaymentCredentials({ '   ': 'value' }), /cannot be empty/);
});

test('returns an empty config for an unknown provider', () => {
  assert.deepEqual(getPaymentProviderConfig({ paymentProviders: '{}' }, 'stripe'), { credentials: {}, options: {} });
});

test('builds Stripe checkout parameters with reference metadata', () => {
  const params = Object.fromEntries(buildStripeCheckoutPayload(input));
  assert.deepEqual(params, {
    mode: 'payment',
    success_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': 'Coffee support',
    'line_items[0][price_data][unit_amount]': '1250',
    'line_items[0][quantity]': '1',
    client_reference_id: 'order_123',
    'metadata[reference_id]': 'order_123',
  });
});

test('builds PayPal checkout payload with reference and return URLs', () => {
  const payload = buildPayPalCheckoutPayload(input);
  assert.equal(payload.intent, 'CAPTURE');
  assert.equal(payload.purchase_units[0].reference_id, 'order_123');
  assert.equal(payload.purchase_units[0].custom_id, 'order_123');
  assert.equal(payload.purchase_units[0].amount.currency_code, 'USD');
  assert.equal(payload.purchase_units[0].amount.value, '12.50');
  assert.equal(payload.application_context.return_url, input.returnUrl);
  assert.equal(payload.application_context.cancel_url, input.cancelUrl);
});

test('selects the correct PayPal environment', () => {
  assert.equal(paypalApiBase(true), 'https://api-m.sandbox.paypal.com');
  assert.equal(paypalApiBase(false), 'https://api-m.paypal.com');
});

test('normalizes Site URL before composing callbacks', () => {
  assert.equal(normalizeSiteUrl(' https://example.com/some/path/ '), 'https://example.com');
  assert.throws(() => normalizeSiteUrl('example.com'), /Invalid URL/);
});
