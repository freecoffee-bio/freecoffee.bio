export type CapturablePayment = {
  provider: string;
  providerPaymentId: string | null;
  status: string;
  amount: number;
  currency: string;
};

export type PayPalCapture = {
  orderId: string;
  amount: number;
  currency: string;
};

export type PayPalCaptureResult = {
  status: 'completed' | 'pending';
  captured: boolean;
};

type CaptureDependencies = {
  findPayment: (referenceId: string) => Promise<CapturablePayment | null>;
  captureOrder: (orderId: string) => Promise<PayPalCapture>;
  completePayment: (referenceId: string, capture: PayPalCapture) => Promise<void>;
};

export async function capturePayPalReference(referenceId: string, dependencies: CaptureDependencies): Promise<PayPalCaptureResult> {
  const payment = await dependencies.findPayment(referenceId);
  if (!payment) throw new Error('Payment record not found.');
  if (payment.provider !== 'paypal') return { status: 'pending', captured: false };
  if (payment.status === 'paid') return { status: 'completed', captured: false };
  if (payment.status !== 'pending') throw new Error('PayPal payment is not eligible for capture.');
  if (!payment.providerPaymentId) throw new Error('PayPal order ID is unavailable.');

  const capture = await dependencies.captureOrder(payment.providerPaymentId);
  if (capture.orderId !== payment.providerPaymentId) throw new Error('PayPal order does not match the checkout.');
  if (capture.amount !== payment.amount) throw new Error('Provider payment amount does not match the checkout.');
  if (capture.currency.toUpperCase() !== payment.currency.toUpperCase()) throw new Error('Provider payment currency does not match the checkout.');

  await dependencies.completePayment(referenceId, capture);
  return { status: 'completed', captured: true };
}
