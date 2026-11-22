CREATE TABLE `deck_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_id` integer NOT NULL,
	`at` text NOT NULL,
	`reason` text DEFAULT 'changes' NOT NULL,
	`hash` text NOT NULL,
	`rows` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deck_snapshots_deck_idx` ON `deck_snapshots` (`deck_id`,`at`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_id` integer NOT NULL,
	`played_at` text NOT NULL,
	`result` text NOT NULL,
	`players` integer DEFAULT 4 NOT NULL,
	`turns` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `games_deck_idx` ON `games` (`deck_id`);