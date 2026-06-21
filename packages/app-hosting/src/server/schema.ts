import { index, integer, sqliteTable, text, uniqueIndex } from "@quick/core/server/drizzle";
import { users } from "@quick/core/server/schema";

// `current_deployment_id` is a plain pointer (no FK) to avoid a circular FK with
// deployments; the service maintains it. Deleting an app cascades its
// deployments, links, and access log.
export const apps = sqliteTable(
  "apps",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shareMode: text("share_mode").notNull(),
    currentDeploymentId: text("current_deployment_id"),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("apps_owner_idx").on(t.ownerUserId)],
);

export const deployments = sqliteTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    fileCount: integer("file_count").notNull(),
    totalBytes: integer("total_bytes").notNull(),
    checksum: text("checksum").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("deployments_app_version_idx").on(t.appId, t.version),
    index("deployments_app_idx").on(t.appId),
  ],
);

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("share_links_app_token_idx").on(t.appId, t.tokenHash),
    index("share_links_app_idx").on(t.appId),
  ],
);

export const accessLog = sqliteTable(
  "hosting_access_log",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    viewerKind: text("viewer_kind"),
    userId: text("user_id"),
    linkId: text("link_id"),
    event: text("event").notNull(),
    path: text("path").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("hosting_access_log_app_idx").on(t.appId, t.createdAt)],
);

export const accessTokens = sqliteTable(
  "access_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("access_tokens_owner_idx").on(t.ownerUserId)],
);

export type AppRow = typeof apps.$inferSelect;
export type DeploymentRow = typeof deployments.$inferSelect;
export type ShareLinkRow = typeof shareLinks.$inferSelect;
export type AccessLogRow = typeof accessLog.$inferSelect;
export type AccessTokenRow = typeof accessTokens.$inferSelect;
