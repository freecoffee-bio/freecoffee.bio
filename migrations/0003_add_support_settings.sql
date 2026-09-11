ALTER TABLE `creator_page_settings` ADD COLUMN `suggested_support_amounts` text DEFAULT '[300,500,1000]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `creator_page_settings` ADD COLUMN `minimum_support_amount` integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE `creator_page_settings` ADD COLUMN `support_wording` text DEFAULT 'donate' NOT NULL;
--> statement-breakpoint
ALTER TABLE `creator_page_settings` ADD COLUMN `support_thank_you_message` text;
