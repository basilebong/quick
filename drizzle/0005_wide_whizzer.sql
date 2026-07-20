ALTER TABLE `app_records` ADD `size_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `app_records` SET `size_bytes` = length(CAST(`data_json` AS BLOB));--> statement-breakpoint
CREATE INDEX `app_records_app_size_idx` ON `app_records` (`app_id`,`size_bytes`);--> statement-breakpoint
CREATE INDEX `app_files_app_size_idx` ON `app_files` (`app_id`,`size_bytes`);
