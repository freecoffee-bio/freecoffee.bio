import assert from 'node:assert/strict';
import test from 'node:test';
import { capturePayPalReference, type CapturablePayment, type PayPalCapture } from '../src/server/paypal-capture';

const pendingPayment: CapturablePayment = {
  provider: 'paypal',
  providerPaymentId: 'PAYPAL-ORDER-1',
  status: 'pending',
  amount: 1250,
  currency: 'USD',
};

function dependencies(payment: CapturablePayment | null, capture: PayPalCapture | Error = { orderId: 'PAYPAL-ORDER-1', amount: 1250, currency: 'USD' }) {
  let captureCalls = 0;
  let completeCalls = 0;
  return {
    dependencies: {
      findPayment: async () => payment,
      captureOrder: async () => {
        captureCalls += 1;
        if (capture instanceof Error) throw capture;
        return capture;
      },
      completePayment: async () => {
        completeCalls += 1;
      },
    },
    captureCalls: () => captureCalls,
    completeCalls: () => completeCalls,
  };
}

test('captures a pending PayPal payment and completes it', async () => {
  const setup = dependencies(pendingPayment);
  const result = await capturePayPalReference('reference-1', setup.dependencies);

  assert.deepEqual(result, { status: 'completed', captured: true });
  assert.equal(setup.captureCalls(), 1);
  assert.equal(setup.completeCalls(), 1);
});

test('does not capture an already paid PayPal payment', async () => {
  const setup = dependencies({ ...pendingPayment, status: 'paid' });
  const result = await capturePayPalReference('reference-1', setup.dependencies);

  assert.deepEqual(result, { status: 'completed', captured: false });
  assert.equal(setup.captureCalls(), 0);
  assert.equal(setup.completeCalls(), 0);
});

test('does not capture a non-PayPal payment', async () => {
  const setup = dependencies({ ...pendingPayment, provider: 'stripe' });
  const result = await capturePayPalReference('reference-1', setup.dependencies);

  assert.deepEqual(result, { status: 'pending', captured: false });
  assert.equal(setup.captureCalls(), 0);
  assert.equal(setup.completeCalls(), 0);
});

test('rejects a PayPal capture with the wrong amount', async () => {
  const setup = dependencies(pendingPayment, { orderId: 'PAYPAL-ORDER-1', amount: 1200, currency: 'USD' });

  await assert.rejects(capturePayPalReference('reference-1', setup.dependencies), /amount does not match/);
  assert.equal(setup.completeCalls(), 0);
});

test('rejects a PayPal capture with the wrong currency', async () => {
  const setup = dependencies(pendingPayment, { orderId: 'PAYPAL-ORDER-1', amount: 1250, currency: 'EUR' });

  await assert.rejects(capturePayPalReference('reference-1', setup.dependencies), /currency does not match/);
  assert.equal(setup.completeCalls(), 0);
});

test('does not complete a payment when the PayPal API fails', async () => {
  const setup = dependencies(pendingPayment, new Error('PayPal capture failed with status 422.'));

  await assert.rejects(capturePayPalReference('reference-1', setup.dependencies), /status 422/);
  assert.equal(setup.completeCalls(), 0);
});
