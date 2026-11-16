ALTER TABLE `decks` ADD `folder` text;--> statement-breakpoint
ALTER TABLE `decks` ADD `pinned` integer DEFAULT false NOT NULL;