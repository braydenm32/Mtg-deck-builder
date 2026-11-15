CREATE TABLE `deck_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_id` integer NOT NULL,
	`oracle_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`board` text DEFAULT 'main' NOT NULL,
	`role` text DEFAULT 'other' NOT NULL,
	`acquire` text,
	`collection_item_id` integer,
	`locked` integer DEFAULT false NOT NULL,
	`added_by` text DEFAULT 'builder' NOT NULL,
	`score` real,
	`synergy` real,
	`reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deck_cards_deck_idx` ON `deck_cards` (`deck_id`);--> statement-breakpoint
CREATE INDEX `deck_cards_oracle_idx` ON `deck_cards` (`oracle_id`);--> statement-breakpoint
CREATE TABLE `decks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`commander_oracle_id` text NOT NULL,
	`partner_oracle_id` text,
	`theme` text,
	`color_identity` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'building' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `edhrec_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`fetched_at` text NOT NULL,
	`status` integer DEFAULT 200 NOT NULL
);
