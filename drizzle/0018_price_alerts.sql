CREATE TABLE `price_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`oracle_id` text NOT NULL,
	`printing_id` text NOT NULL,
	`finish` text DEFAULT 'nonfoil' NOT NULL,
	`direction` text NOT NULL,
	`usd` real NOT NULL,
	`created_at` text NOT NULL,
	`fired_at` text,
	`fired_usd` real
);
--> statement-breakpoint
CREATE INDEX `price_alerts_fired_idx` ON `price_alerts` (`fired_at`);