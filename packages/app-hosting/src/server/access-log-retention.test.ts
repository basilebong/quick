import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { users } from "@quick/core/server/schema";
import { createTestDb } from "@quick/core/server/test";
import { parseAppId, parseUserId } from "@quick/core/shared";
import { createAccessLogRetention } from "./access-log-retention.ts";
import { accessLog } from "./schema.ts";
import { createHostingService } from "./service.ts";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("access log retention", () => {
  test("sweeps immediately on start with a cutoff of now minus the ttl", async () => {
    const cutoffs: Date[] = [];
    const ttlMs = 30 * 24 * 60 * 60 * 1000;
    const retention = createAccessLogRetention({
      service: {
        purgeAccessLogOlderThan: async (cutoff) => {
          cutoffs.push(cutoff);
          return 0;
        },
      },
      ttlMs,
      intervalMs: 60_000,
    });

    const before = Date.now();
    retention.start();
    const after = Date.now();
    await retention.close();

    expect(cutoffs).toHaveLength(1);
    const [cutoff] = cutoffs;
    if (cutoff === undefined) throw new Error("expected one sweep");
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - ttlMs);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - ttlMs);
  });

  test("start is idempotent: a second start does not trigger another sweep", async () => {
    let calls = 0;
    const retention = createAccessLogRetention({
      service: {
        purgeAccessLogOlderThan: async () => {
          calls += 1;
          return 0;
        },
      },
      ttlMs: 1000,
      intervalMs: 60_000,
    });

    retention.start();
    retention.start();
    await retention.close();

    expect(calls).toBe(1);
  });

  test("close waits for an in-flight sweep before resolving", async () => {
    let resolvePurge: (() => void) | undefined;
    const retention = createAccessLogRetention({
      service: {
        purgeAccessLogOlderThan: () =>
          new Promise<number>((resolve) => {
            resolvePurge = () => resolve(0);
          }),
      },
      ttlMs: 1000,
      intervalMs: 60_000,
    });

    retention.start();
    if (resolvePurge === undefined) throw new Error("expected a sweep to be in flight");

    let closed = false;
    const closing = retention.close().then(() => {
      closed = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(false);

    resolvePurge();
    await closing;
    expect(closed).toBe(true);
  });

  test("keeps sweeping on the interval and stops once closed", async () => {
    let calls = 0;
    const retention = createAccessLogRetention({
      service: {
        purgeAccessLogOlderThan: async () => {
          calls += 1;
          return 0;
        },
      },
      ttlMs: 1000,
      intervalMs: 10,
    });

    retention.start();
    await tick(55);
    await retention.close();
    const afterClose = calls;
    expect(afterClose).toBeGreaterThanOrEqual(3);

    await tick(40);
    expect(calls).toBe(afterClose);
  });

  test("a failing sweep is logged and the next one still runs", async () => {
    let calls = 0;
    const logged: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      const retention = createAccessLogRetention({
        service: {
          purgeAccessLogOlderThan: async () => {
            calls += 1;
            throw new Error("db unavailable");
          },
        },
        ttlMs: 1000,
        intervalMs: 10,
      });

      retention.start();
      await tick(35);
      await retention.close();
    } finally {
      console.error = originalError;
    }

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(logged).toHaveLength(calls);
  });

  test("purges expired rows from a real hosting service on start", async () => {
    const db = createTestDb();
    const appsDir = mkdtempSync(join(tmpdir(), "quick-apps-"));
    try {
      const service = createHostingService(db, { appsDir });
      const owner = parseUserId("owner_1");
      await db.insert(users).values({
        id: owner,
        name: "Owner",
        email: "owner@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const created = await service.createApp(
        { slug: "retention", name: "retention", shareMode: "link" },
        owner,
      );
      if (created.kind !== "ok") throw new Error("createApp failed");
      const appId = parseAppId(created.value.id);
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      for (const [id, ageDays] of [
        ["expired", 31],
        ["fresh", 1],
      ] as const) {
        await db.insert(accessLog).values({
          id,
          appId,
          mode: "link",
          viewerKind: null,
          userId: null,
          linkId: null,
          event: "view",
          path: "/",
          createdAt: new Date(now - ageDays * day),
        });
      }

      const retention = createAccessLogRetention({
        service,
        ttlMs: 30 * day,
        intervalMs: 60_000,
      });
      retention.start();
      await retention.close();

      const remaining = await db.select({ id: accessLog.id }).from(accessLog);
      expect(remaining.map((r) => r.id)).toEqual(["fresh"]);
    } finally {
      rmSync(appsDir, { recursive: true, force: true });
    }
  });
});
