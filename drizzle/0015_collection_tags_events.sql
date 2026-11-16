CREATE TABLE `collection_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`oracle_id` text,
	`printing_id` text,
	`quantity` integer DEFAULT 0 NOT NULL,
	`price_usd` real,
	`detail` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collection_events_at_idx` ON `collection_events` (`at`);--> statement-breakpoint
ALTER TABLE `collection_items` ADD `tags` text;