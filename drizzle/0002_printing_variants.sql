ALTER TABLE `collection_items` ADD `printing_confidence` text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE `printings` ADD `set_type` text DEFAULT 'expansion' NOT NULL;--> statement-breakpoint
ALTER TABLE `printings` ADD `variant_rank` integer DEFAULT 0 NOT NULL;