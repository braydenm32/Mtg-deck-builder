CREATE TABLE `package_cards` (
	`package_id` integer NOT NULL,
	`oracle_id` text NOT NULL,
	PRIMARY KEY(`package_id`, `oracle_id`)
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `decks` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `decks_share_token_unique` ON `decks` (`share_token`);