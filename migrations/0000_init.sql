CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`issuer` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `admin_bootstrap` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`content_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_comments_content_idx` ON `content_comments` (`content_type`,`content_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `creator_crypto_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` integer NOT NULL,
	`network` text NOT NULL,
	`asset` text NOT NULL,
	`address` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_crypto_wallet_unique` ON `creator_crypto_wallets` (`creator_id`,`network`,`asset`);--> statement-breakpoint
CREATE TABLE `creator_page_settings` (
	`creator_id` integer PRIMARY KEY NOT NULL,
	`theme_color` text DEFAULT '#111111' NOT NULL,
	`welcome_message` text,
	`default_support_amount` integer DEFAULT 500 NOT NULL,
	`allow_anonymous` integer DEFAULT true NOT NULL,
	`show_support` integer DEFAULT true NOT NULL,
	`show_shop` integer DEFAULT true NOT NULL,
	`support_goal_enabled` integer DEFAULT false NOT NULL,
	`support_goal_title` text,
	`support_goal_amount` integer,
	`support_goal_description` text,
	`terms` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `creator_payment_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` integer NOT NULL,
	`provider` text NOT NULL,
	`external_account_id` text,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`connected_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_payment_accounts_provider_unique` ON `creator_payment_accounts` (`creator_id`,`provider`);--> statement-breakpoint
CREATE TABLE `creator_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text,
	`website` text,
	`image` text,
	`social_links` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creator_profiles_user_id_unique` ON `creator_profiles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `creator_profiles_handle_unique` ON `creator_profiles` (`handle`);--> statement-breakpoint
CREATE TABLE `email_delivery_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_provider` text,
	`api_providers` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`base_currency` text DEFAULT 'USD' NOT NULL,
	`quote_currency` text NOT NULL,
	`rate` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`effective_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_base_quote_unique` ON `exchange_rates` (`base_currency`,`quote_currency`);--> statement-breakpoint
CREATE TABLE `gallery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` integer NOT NULL,
	`album_id` text,
	`title` text NOT NULL,
	`description` text,
	`image_url` text NOT NULL,
	`link_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`file_size` integer NOT NULL,
	`folder` text,
	`public_url` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_object_key_unique` ON `media_files` (`object_key`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`recipient` text NOT NULL,
	`template` text NOT NULL,
	`reference_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`payload_json` text,
	`dedupe_key` text,
	`available_at` integer,
	`locked_at` integer,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_dedupe_key_unique` ON `notification_deliveries` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`display_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body_text` text NOT NULL,
	`body_html` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_templates_event_channel_unique` ON `notification_templates` (`event_key`,`channel`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`product_name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_amount` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_amount_nonnegative" CHECK("order_items"."unit_amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_product_unique` ON `order_items` (`order_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` integer NOT NULL,
	`buyer_user_id` text,
	`buyer_email` text NOT NULL,
	`subtotal_amount` integer DEFAULT 0 NOT NULL,
	`tax_rate` integer DEFAULT 0 NOT NULL,
	`tax_amount` integer DEFAULT 0 NOT NULL,
	`total_amount` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`settlement_currency` text,
	`settlement_amount` integer,
	`exchange_rate` text,
	`exchange_rate_source` text,
	`exchange_rate_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text,
	`provider_payment_id` text,
	`expires_at` integer,
	`closed_at` integer,
	`close_reason` text,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`buyer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `orders_creator_id_idx` ON `orders` (`creator_id`);--> statement-breakpoint
CREATE INDEX `orders_buyer_user_id_idx` ON `orders` (`buyer_user_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_status_expires_at_idx` ON `orders` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`error` text,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_provider_event_unique` ON `payment_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`reference_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`provider` text NOT NULL,
	`provider_payment_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`raw_reference` text,
	`network` text,
	`asset` text,
	`wallet_address` text,
	`transaction_hash` text,
	`confirmations` integer,
	`required_confirmations` integer,
	`quoted_amount` integer,
	`quoted_currency` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_records_provider_reference_unique` ON `payment_records` (`provider`,`reference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_records_provider_payment_unique` ON `payment_records` (`provider`,`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payment_records_reference_id_idx` ON `payment_records` (`reference_id`);--> statement-breakpoint
CREATE INDEX `payment_records_user_id_idx` ON `payment_records` (`user_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` integer NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`cover_image_url` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_files` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`checksum` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_files_product_id_unique` ON `product_files` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_image_url` text,
	`product_type` text DEFAULT 'digital' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `s3_storage_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`region` text DEFAULT 'us-east-1' NOT NULL,
	`bucket` text NOT NULL,
	`path_prefix` text DEFAULT 'media' NOT NULL,
	`access_key_id` text NOT NULL,
	`secret_access_key` text NOT NULL,
	`force_path_style` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`site_url` text DEFAULT '' NOT NULL,
	`site_name` text DEFAULT 'FreeCoffee.bio' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`tax_rate` integer DEFAULT 0 NOT NULL,
	`payment_providers` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `smtp_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`host` text DEFAULT '' NOT NULL,
	`port` integer DEFAULT 587 NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`password` text DEFAULT '' NOT NULL,
	`secure` integer DEFAULT true NOT NULL,
	`from_address` text DEFAULT '' NOT NULL,
	`reply_to` text,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `support_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` integer NOT NULL,
	`supporter_user_id` text,
	`supporter_email` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message` text,
	`display_name` text,
	`anonymous` integer DEFAULT false NOT NULL,
	`provider` text,
	`provider_payment_id` text,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`creator_id`) REFERENCES `creator_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supporter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `support_transactions_creator_id_idx` ON `support_transactions` (`creator_id`);--> statement-breakpoint
CREATE INDEX `support_transactions_supporter_user_id_idx` ON `support_transactions` (`supporter_user_id`);--> statement-breakpoint
CREATE INDEX `support_transactions_status_idx` ON `support_transactions` (`status`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
