CREATE TABLE `app_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`accept_mime` text,
	`max_bytes` integer,
	`active` integer DEFAULT true NOT NULL,
	`storage` text DEFAULT 'inline' NOT NULL,
	`content_type` text,
	`size_bytes` integer,
	`checksum` text,
	`blob` blob,
	`filled_by_user_id` text,
	`filled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`filled_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_slots_app_key_idx` ON `app_slots` (`app_id`,`key`);--> statement-breakpoint
CREATE INDEX `app_slots_app_idx` ON `app_slots` (`app_id`);