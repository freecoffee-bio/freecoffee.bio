CREATE TABLE `chain_payment_amount_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`asset` text NOT NULL,
	`wallet_address` text NOT NULL,
	`amount` integer NOT NULL,
	`reference_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chain_payment_amount_slots_reference_id_unique` ON `chain_payment_amount_slots` (`reference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chain_payment_amount_slots_scope_unique` ON `chain_payment_amount_slots` (`network`,`asset`,`wallet_address`,`amount`);--> statement-breakpoint
CREATE INDEX `chain_payment_amount_slots_expires_at_idx` ON `chain_payment_amount_slots` (`expires_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `chain_payment_amount_slots` (`id`, `network`, `asset`, `wallet_address`, `amount`, `reference_id`, `expires_at`, `created_at`)
SELECT lower(hex(randomblob(16))), lower(`network`), upper(`asset`), `wallet_address`, `amount`, `reference_id`, `expires_at`, `created_at`
FROM `payment_records`
WHERE `status` = 'pending'
  AND `network` IS NOT NULL
  AND `asset` IS NOT NULL
  AND `wallet_address` IS NOT NULL
  AND `expires_at` > unixepoch('now');