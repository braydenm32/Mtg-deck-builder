DROP INDEX `collection_stack_uq`;--> statement-breakpoint
ALTER TABLE `collection_items` ADD `match_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `collection_stack_uq` ON `collection_items` (`printing_id`,`finish`,`lang`,`condition`,`location`,`altered`,`signed`,`misprint`,`proxy`,`source`);--> statement-breakpoint
ALTER TABLE `import_batches` ADD `snapshot` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `undone_at` text;