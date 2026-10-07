-- Runs inside the migrator's transaction, where PRAGMA foreign_keys is a no-op, so
-- dropping oauth_refresh_tokens cascades into every table referencing it by name.
-- Access tokens are copied to a constraint-free table first and restored after.
-- Legacy NULL timestamps become 0 (already expired) rather than failing the boot.
CREATE TABLE `__oauth_access_tokens_backup` AS SELECT * FROM `oauth_access_tokens`;--> statement-breakpoint
CREATE TABLE `__new_oauth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`auth_time` integer,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_refresh_tokens`("id", "token", "client_id", "session_id", "user_id", "reference_id", "expires_at", "created_at", "revoked", "auth_time", "scopes") SELECT "id", "token", "client_id", "session_id", "user_id", "reference_id", COALESCE("expires_at", 0), COALESCE("created_at", 0), "revoked", "auth_time", "scopes" FROM `oauth_refresh_tokens`;--> statement-breakpoint
DROP TABLE `oauth_refresh_tokens`;--> statement-breakpoint
ALTER TABLE `__new_oauth_refresh_tokens` RENAME TO `oauth_refresh_tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_tokens_token_unique` ON `oauth_refresh_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `oauthRefreshTokens_clientId_idx` ON `oauth_refresh_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshTokens_sessionId_idx` ON `oauth_refresh_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshTokens_userId_idx` ON `oauth_refresh_tokens` (`user_id`);--> statement-breakpoint
DROP TABLE `oauth_access_tokens`;--> statement-breakpoint
CREATE TABLE `oauth_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_tokens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `oauth_access_tokens`("id", "token", "client_id", "session_id", "user_id", "reference_id", "refresh_id", "expires_at", "created_at", "scopes") SELECT "id", "token", "client_id", "session_id", "user_id", "reference_id", "refresh_id", COALESCE("expires_at", 0), COALESCE("created_at", 0), "scopes" FROM `__oauth_access_tokens_backup` WHERE "token" IS NOT NULL;--> statement-breakpoint
DROP TABLE `__oauth_access_tokens_backup`;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_tokens_token_unique` ON `oauth_access_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_clientId_idx` ON `oauth_access_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_sessionId_idx` ON `oauth_access_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_userId_idx` ON `oauth_access_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_refreshId_idx` ON `oauth_access_tokens` (`refresh_id`);--> statement-breakpoint
CREATE TABLE `__new_oauth_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_consents`("id", "client_id", "user_id", "reference_id", "scopes", "created_at", "updated_at") SELECT "id", "client_id", "user_id", "reference_id", "scopes", COALESCE("created_at", "updated_at", 0), COALESCE("updated_at", "created_at", 0) FROM `oauth_consents`;--> statement-breakpoint
DROP TABLE `oauth_consents`;--> statement-breakpoint
ALTER TABLE `__new_oauth_consents` RENAME TO `oauth_consents`;--> statement-breakpoint
CREATE INDEX `oauthConsents_clientId_idx` ON `oauth_consents` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthConsents_userId_idx` ON `oauth_consents` (`user_id`);
