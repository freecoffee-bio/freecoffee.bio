ALTER TABLE `notification_deliveries` ADD COLUMN `payload_json` text;
--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD COLUMN `dedupe_key` text;
--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD COLUMN `available_at` integer;
--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD COLUMN `locked_at` integer;
--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD COLUMN `sent_at` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_dedupe_key_unique` ON `notification_deliveries` (`dedupe_key`);
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `closed_at` integer;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `close_reason` text;
--> statement-breakpoint
UPDATE `orders` SET `expires_at` = `created_at` + 1200000 WHERE `expires_at` IS NULL AND `status` = 'pending';
--> statement-breakpoint
CREATE INDEX `notification_deliveries_due_idx` ON `notification_deliveries` (`status`,`available_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX `orders_status_expires_at_idx` ON `orders` (`status`,`expires_at`);
