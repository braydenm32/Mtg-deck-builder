CREATE TABLE `price_history` (
	`printing_id` text NOT NULL,
	`date` text NOT NULL,
	`usd` real,
	`usd_foil` real,
	`usd_etched` real,
	`was_usd` real,
	`was_usd_foil` real,
	`was_usd_etched` real,
	PRIMARY KEY(`printing_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `price_history_date_idx` ON `price_history` (`date`);--> statement-breakpoint
CREATE TABLE `price_seen` (
	`printing_id` text PRIMARY KEY NOT NULL,
	`usd` real,
	`usd_foil` real,
	`usd_etched` real,
	`seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `value_history` (
	`date` text PRIMARY KEY NOT NULL,
	`usd` real,
	`copies` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `printings` ADD `price_eur` real;--> statement-breakpoint
ALTER TABLE `printings` ADD `price_eur_foil` real;