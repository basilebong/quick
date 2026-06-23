CREATE TABLE `app_allowed_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_allowed_emails_app_email_idx` ON `app_allowed_emails` (`app_id`,`email`);--> statement-breakpoint
CREATE INDEX `app_allowed_emails_app_idx` ON `app_allowed_emails` (`app_id`);