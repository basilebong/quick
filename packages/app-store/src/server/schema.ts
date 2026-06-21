import { index, integer, sqliteTable, text } from "@quick/core/server/drizzle";

// A per-app document store. `app_id` is a plain column (no FK) — the apps table
// lives in @quick/app-hosting and packages do not depend on each other. Every
// query is scoped by `app_id`, which is the cross-app isolation invariant.
export const appRecords = sqliteTable(
  "app_records",
  {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull(),
    collection: text("collection").notNull(),
    dataJson: text("data_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("app_records_app_collection_idx").on(t.appId, t.collection, t.createdAt)],
);

export type AppRecordRow = typeof appRecords.$inferSelect;
export type AppRecordInsert = typeof appRecords.$inferInsert;
