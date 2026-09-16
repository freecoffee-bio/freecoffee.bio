DELETE FROM `notification_deliveries`;--> statement-breakpoint
DROP INDEX `notification_deliveries_pending_created_idx`;--> statement-breakpoint
CREATE INDEX `notification_deliveries_queue_lookup_idx` ON `notification_deliveries` (`channel`,`status`,`created_at`);