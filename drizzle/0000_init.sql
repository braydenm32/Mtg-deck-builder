CREATE TABLE `cards` (
	`oracle_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`norm_name` text NOT NULL,
	`norm_front_name` text NOT NULL,
	`mana_cost` text,
	`cmc` real DEFAULT 0 NOT NULL,
	`type_line` text DEFAULT '' NOT NULL,
	`oracle_text` text DEFAULT '' NOT NULL,
	`colors` text DEFAULT '' NOT NULL,
	`color_identity` text DEFAULT '' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`layout` text DEFAULT 'normal' NOT NULL,
	`legal_commander` text DEFAULT 'not_legal' NOT NULL,
	`can_be_commander` integer DEFAULT false NOT NULL,
	`edhrec_rank` integer,
	`game_changer` integer DEFAULT false NOT NULL,
	`image_normal` text,
	`image_small` text,
	`card_faces` text,
	`price_usd` real,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_norm_name_idx` ON `cards` (`norm_name`);--> statement-breakpoint
CREATE INDEX `cards_norm_front_name_idx` ON `cards` (`norm_front_name`);--> statement-breakpoint
CREATE INDEX `cards_color_identity_idx` ON `cards` (`color_identity`);--> statement-breakpoint
CREATE TABLE `collection_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printing_id` text NOT NULL,
	`oracle_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`finish` text DEFAULT 'nonfoil' NOT NULL,
	`condition` text DEFAULT '' NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`altered` integer DEFAULT false NOT NULL,
	`signed` integer DEFAULT false NOT NULL,
	`misprint` integer DEFAULT false NOT NULL,
	`proxy` integer DEFAULT false NOT NULL,
	`purchase_price` real,
	`source` text NOT NULL,
	`batch_id` integer,
	`added_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collection_oracle_idx` ON `collection_items` (`oracle_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_stack_uq` ON `collection_items` (`printing_id`,`finish`,`lang`,`condition`,`location`,`altered`,`signed`,`misprint`,`proxy`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`filename` text,
	`created_at` text NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`matched_count` integer DEFAULT 0 NOT NULL,
	`unmatched_count` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'add' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `printings` (
	`id` text PRIMARY KEY NOT NULL,
	`oracle_id` text NOT NULL,
	`name` text NOT NULL,
	`set_code` text NOT NULL,
	`set_name` text NOT NULL,
	`collector_number` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`rarity` text DEFAULT 'common' NOT NULL,
	`finishes` text DEFAULT '["nonfoil"]' NOT NULL,
	`tcgplayer_id` integer,
	`released_at` text,
	`image_normal` text,
	`image_small` text,
	`price_usd` real,
	`price_usd_foil` real,
	`price_usd_etched` real,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `printings_oracle_idx` ON `printings` (`oracle_id`);--> statement-breakpoint
CREATE INDEX `printings_set_num_idx` ON `printings` (`set_code`,`collector_number`);--> statement-breakpoint
CREATE INDEX `printings_tcgplayer_idx` ON `printings` (`tcgplayer_id`);--> statement-breakpoint
CREATE TABLE `unmatched_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`row_number` integer NOT NULL,
	`name` text,
	`set_code` text,
	`collector_number` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`reason` text NOT NULL,
	`raw` text NOT NULL
);
