import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Single-use, short-TTL codes that hand a signed-in apex session off to an app
// subdomain (see ../sso/routes.ts). Rows are consumed (deleted) on use. `app_id`
// is a plain column (no FK) because the apps table lives in @quick/app-hosting
// and core must not depend on an app package.
export const ssoCodes = sqliteTable(
  "sso_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    appId: text("app_id").notNull(),
    userId: text("user_id").notNull(),
    userEmail: text("user_email").notNull(),
    userName: text("user_name").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("sso_codes_expires_at_idx").on(table.expiresAt)],
);

export type SsoCodeRow = typeof ssoCodes.$inferSelect;
export type SsoCodeInsert = typeof ssoCodes.$inferInsert;
