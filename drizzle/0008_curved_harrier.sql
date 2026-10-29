CREATE TABLE `oauth_client_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_client_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `oauth_resources`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientResources_clientId_resourceId_uidx` ON `oauth_client_resources` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE INDEX `oauthClientResources_clientId_idx` ON `oauth_client_resources` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthClientResources_resourceId_idx` ON `oauth_client_resources` (`resource_id`);--> statement-breakpoint
CREATE TABLE `oauth_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_resources_identifier_unique` ON `oauth_resources` (`identifier`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_oauth_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_tokens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_access_tokens`("id", "token", "client_id", "session_id", "user_id", "reference_id", "refresh_id", "expires_at", "created_at", "scopes") SELECT "id", "token", "client_id", "session_id", "user_id", "reference_id", "refresh_id", "expires_at", COALESCE("created_at", "expires_at"), "scopes" FROM `oauth_access_tokens` WHERE "token" IS NOT NULL AND "expires_at" IS NOT NULL;--> statement-breakpoint
DROP TABLE `oauth_access_tokens`;--> statement-breakpoint
ALTER TABLE `__new_oauth_access_tokens` RENAME TO `oauth_access_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_tokens_token_unique` ON `oauth_access_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_clientId_idx` ON `oauth_access_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_sessionId_idx` ON `oauth_access_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_userId_idx` ON `oauth_access_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_authorizationCodeId_idx` ON `oauth_access_tokens` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessTokens_refreshId_idx` ON `oauth_access_tokens` (`refresh_id`);--> statement-breakpoint
CREATE TABLE `__new_oauth_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_consents`("id", "client_id", "user_id", "reference_id", "scopes", "created_at", "updated_at") SELECT "id", "client_id", "user_id", "reference_id", "scopes", COALESCE("created_at", "updated_at", CAST(unixepoch('subsec') * 1000 AS INTEGER)), COALESCE("updated_at", "created_at", CAST(unixepoch('subsec') * 1000 AS INTEGER)) FROM `oauth_consents`;--> statement-breakpoint
DROP TABLE `oauth_consents`;--> statement-breakpoint
ALTER TABLE `__new_oauth_consents` RENAME TO `oauth_consents`;--> statement-breakpoint
CREATE INDEX `oauthConsents_clientId_idx` ON `oauth_consents` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthConsents_userId_idx` ON `oauth_consents` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_oauth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_refresh_tokens`("id", "token", "client_id", "session_id", "user_id", "reference_id", "expires_at", "created_at", "revoked", "auth_time", "scopes") SELECT "id", "token", "client_id", "session_id", "user_id", "reference_id", "expires_at", COALESCE("created_at", "auth_time", "expires_at"), "revoked", "auth_time", "scopes" FROM `oauth_refresh_tokens` WHERE "expires_at" IS NOT NULL;--> statement-breakpoint
DROP TABLE `oauth_refresh_tokens`;--> statement-breakpoint
ALTER TABLE `__new_oauth_refresh_tokens` RENAME TO `oauth_refresh_tokens`;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_tokens_token_unique` ON `oauth_refresh_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `oauthRefreshTokens_clientId_idx` ON `oauth_refresh_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshTokens_sessionId_idx` ON `oauth_refresh_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshTokens_userId_idx` ON `oauth_refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshTokens_authorizationCodeId_idx` ON `oauth_refresh_tokens` (`authorization_code_id`);--> statement-breakpoint
ALTER TABLE `jwkss` ADD `alg` text;--> statement-breakpoint
ALTER TABLE `jwkss` ADD `crv` text;--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `client_discovery_id` text;--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `client_credentials_scopes` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `backchannel_logout_uri` text;--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `backchannel_logout_session_required` integer;--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `application_type` text;--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `jwks` text;--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `jwks_uri` text;--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD `dpop_bound_access_tokens` integer DEFAULT false;--> statement-breakpoint
UPDATE `oauth_clients` SET `application_type` = CASE `type` WHEN 'native' THEN 'native' WHEN 'web' THEN 'web' WHEN 'user-agent-based' THEN 'web' END;--> statement-breakpoint
ALTER TABLE `oauth_clients` DROP COLUMN `public`;--> statement-breakpoint
ALTER TABLE `oauth_clients` DROP COLUMN `type`;