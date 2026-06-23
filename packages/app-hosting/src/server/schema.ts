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

// A google-mode app's viewer allowlist. Empty set ⇒ any signed-in Google account
// may view; non-empty ⇒ only these emails. Emails are stored normalized
// (trimmed, lowercased) and the access decision re-reads them every request.
export const appAllowedEmails = sqliteTable(
  "app_allowed_emails",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("app_allowed_emails_app_email_idx").on(t.appId, t.email),
    index("app_allowed_emails_app_idx").on(t.appId),
  ],
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

// A google-mode viewer's per-app credential. The `quick_app_sess` cookie holds an
// opaque random token; only its SHA-256 hash is stored, re-validated every request
// (so expiry takes effect immediately and there is nothing signed to forge). It is
// host-only to one app subdomain — the owner's apex session never reaches a tenant.
export const appSessions = sqliteTable(
  "app_sessions",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("app_sessions_app_token_idx").on(t.appId, t.tokenHash),
    index("app_sessions_app_idx").on(t.appId),
  ],
);

// A single-use, short-TTL code minted on the apex (where the Better Auth session
// lives) and redeemed on the tenant subdomain to bootstrap an `appSessions` row —
// the cross-subdomain handoff that replaces a shared parent-domain cookie.
export const appSessionCodes = sqliteTable(
  "app_session_codes",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("app_session_codes_app_idx").on(t.appId)],
);

export type AppRow = typeof apps.$inferSelect;
export type AppAllowedEmailRow = typeof appAllowedEmails.$inferSelect;
export type DeploymentRow = typeof deployments.$inferSelect;
export type ShareLinkRow = typeof shareLinks.$inferSelect;
export type AccessLogRow = typeof accessLog.$inferSelect;
export type AccessTokenRow = typeof accessTokens.$inferSelect;
export type AppSessionRow = typeof appSessions.$inferSelect;
export type AppSessionCodeRow = typeof appSessionCodes.$inferSelect;
