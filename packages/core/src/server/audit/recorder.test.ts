import { describe, expect, test } from "bun:test";
import { parseUserId } from "../../shared/index.ts";
import { eq } from "../drizzle.ts";
import { withTestAuth } from "../test/index.ts";
import { createAuditRecorder } from "./recorder.ts";
import { auditLog } from "./schema.ts";

describe("audit recorder", () => {
  test("records an entry with metadata serialized to JSON", async () => {
    await withTestAuth({}, async ({ db }) => {
      const recorder = createAuditRecorder(db);
      const userId = parseUserId("user_123");

      await recorder.record({
        userId,
        action: "grocery__add_item",
        via: "mcp",
        metadata: { itemId: "abc", name: "Milk" },
      });

      const rows = await db.select().from(auditLog).where(eq(auditLog.userId, userId));
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row?.action).toBe("grocery__add_item");
      expect(row?.via).toBe("mcp");
      expect(row?.metadataJson).toBe(JSON.stringify({ itemId: "abc", name: "Milk" }));
      expect(row?.createdAt).toBeInstanceOf(Date);
    });
  });

  test("stores null metadata when omitted", async () => {
    await withTestAuth({}, async ({ db }) => {
      const recorder = createAuditRecorder(db);
      const userId = parseUserId("user_456");

      await recorder.record({ userId, action: "grocery__list_items", via: "mcp" });

      const rows = await db.select().from(auditLog).where(eq(auditLog.userId, userId));
      expect(rows[0]?.metadataJson).toBeNull();
    });
  });
});
