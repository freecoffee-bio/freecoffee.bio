import { minorToAmount, type Currency } from './money';

export type PaymentPayloadInput = {
  referenceId: string;
  amount: number;
  currency: Currency;
  description: string;
  returnUrl: string;
  cancelUrl: string;
};

export function buildStripeCheckoutPayload(input: PaymentPayloadInput): URLSearchParams {
  return new URLSearchParams({
    mode: 'payment',
    success_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    'line_items[0][price_data][currency]': input.currency.toLowerCase(),
    'line_items[0][price_data][product_data][name]': input.description,
    'line_items[0][price_data][unit_amount]': String(input.amount),
    'line_items[0][quantity]': '1',
    client_reference_id: input.referenceId,
    'metadata[reference_id]': input.referenceId,
  });
}

export function buildPayPalCheckoutPayload(input: PaymentPayloadInput) {
  return {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: input.referenceId,
      custom_id: input.referenceId,
      description: input.description,
      amount: {
        currency_code: input.currency.toUpperCase(),
        value: minorToAmount(input.amount, input.currency),
      },
    }],
    application_context: {
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      user_action: 'PAY_NOW',
    },
  } as const;
}

export function paypalApiBase(sandbox: boolean): string {
  return sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}
