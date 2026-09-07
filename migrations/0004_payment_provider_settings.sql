ALTER TABLE `site_settings` ADD COLUMN `payment_providers` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `site_settings` SET `payment_providers` = json_object(
  'stripe', json_object('secretKey', `stripe_secret_key`, 'webhookSecret', `stripe_webhook_secret`),
  'paypal', json_object('clientId', `paypal_client_id`, 'clientSecret', `paypal_client_secret`, 'webhookId', `paypal_webhook_id`, 'sandbox', `paypal_sandbox`)
) WHERE `id` = 1;
