import { describe, expect, test } from "bun:test";
import { createTestDb } from "../test/db.ts";
import { sessions, users } from "./schema.ts";
import { purgeExpiredSessions } from "./sessions.ts";

describe("purgeExpiredSessions", () => {
  test("deletes sessions past their expiry and keeps live ones", async () => {
    const db = createTestDb();
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    await db.insert(users).values({
      id: "user_1",
      name: "Viewer",
      email: "viewer@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });

    const insertSession = (id: string, expiresInMs: number) =>
      db.insert(sessions).values({
        id,
        token: `token_${id}`,
        userId: "user_1",
        expiresAt: new Date(now + expiresInMs),
        createdAt: new Date(now - hour),
        updatedAt: new Date(now - hour),
        ipAddress: "203.0.113.7",
        userAgent: "Mozilla/5.0 (probe)",
      });

    await insertSession("dead_a", -hour);
    await insertSession("dead_b", -1);
    await insertSession("live", hour);

    const purged = await purgeExpiredSessions(db, new Date(now));
    expect(purged).toBe(2);

    const remaining = await db.select({ id: sessions.id }).from(sessions);
    expect(remaining.map((row) => row.id)).toEqual(["live"]);
  });
});
