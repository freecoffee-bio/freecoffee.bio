CREATE TABLE `exchange_rate_sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_attempt_at` integer NOT NULL,
	`last_success_at` integer,
	`last_error` text
);
--> statement-breakpoint
ALTER TABLE `payment_records` ADD `base_payment_amount` integer;--> statement-breakpoint
ALTER TABLE `payment_records` ADD `exchange_rate` text;--> statement-breakpoint
ALTER TABLE `payment_records` ADD `exchange_rate_source` text;--> statement-breakpoint
ALTER TABLE `payment_records` ADD `exchange_rate_at` integer;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `exchange_rate_mode` text DEFAULT 'automatic' NOT NULL;