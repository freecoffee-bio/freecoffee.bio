import { getPaymentProviderConfig } from './payment-config';
import { getSiteSettings } from './site-settings';

export type PaymentSettings = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  paypalClientId: string;
  paypalClientSecret: string;
  paypalWebhookId: string;
  paypalSandbox: boolean;
};

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const settings = await getSiteSettings();
  const stripe = getPaymentProviderConfig(settings, 'stripe');
  const paypal = getPaymentProviderConfig(settings, 'paypal');

  return {
    stripeSecretKey: stripe.credentials.secretKey ?? '',
    stripeWebhookSecret: stripe.credentials.webhookSecret ?? '',
    paypalClientId: paypal.credentials.clientId ?? '',
    paypalClientSecret: paypal.credentials.clientSecret ?? '',
    paypalWebhookId: paypal.credentials.webhookId ?? '',
    paypalSandbox: paypal.options.sandbox === true,
  };
}
