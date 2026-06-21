import { blob, index, integer, sqliteTable, text, uniqueIndex } from "@quick/core/server/drizzle";

// Per-app file storage. v1 stores bytes inline as a SQLite BLOB (so Litestream
// covers them); the `storage` discriminator is the additive S3 upgrade path.
// `app_id` is a plain column (no cross-package FK); every query is app-scoped.
export const appFiles = sqliteTable(
  "app_files",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    path: text("path").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storage: text("storage").notNull(),
    blob: blob("blob", { mode: "buffer" }),
    checksum: text("checksum").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("app_files_app_path_idx").on(t.appId, t.path),
    index("app_files_app_created_idx").on(t.appId, t.createdAt),
  ],
);

export type AppFileRow = typeof appFiles.$inferSelect;
export type AppFileInsert = typeof appFiles.$inferInsert;
