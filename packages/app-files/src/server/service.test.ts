import { beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@quick/core/server";
import { createTestDb } from "@quick/core/server/test";
import { type AppId, parseAppId } from "@quick/core/shared";
import { createFilesService } from "./service.ts";

let db: Db;
const APP_A: AppId = parseAppId("app_a");
const APP_B: AppId = parseAppId("app_b");
const bytes = (n: number) => new Uint8Array(n);

beforeEach(() => {
  db = createTestDb();
});

describe("files per-app byte quota", () => {
  test("rejects a put that would push the app over its total-bytes cap", async () => {
    const files = createFilesService(db, { maxTotalBytesPerApp: 10 });
    expect((await files.put(APP_A, "a.bin", "application/octet-stream", bytes(6), null)).kind).toBe(
      "ok",
    );
    const over = await files.put(APP_A, "b.bin", "application/octet-stream", bytes(6), null);
    expect(over.kind === "err" && over.error.kind).toBe("quota_exceeded");
    // The cap is per-app: a different app is unaffected.
    expect((await files.put(APP_B, "a.bin", "application/octet-stream", bytes(6), null)).kind).toBe(
      "ok",
    );
  });

  test("replacing a file counts the net delta, not the full new size", async () => {
    const files = createFilesService(db, { maxTotalBytesPerApp: 10 });
    expect((await files.put(APP_A, "a.bin", "application/octet-stream", bytes(6), null)).kind).toBe(
      "ok",
    );
    // 6 used, replacing with 8 → projected 8, still within 10.
    expect((await files.put(APP_A, "a.bin", "application/octet-stream", bytes(8), null)).kind).toBe(
      "ok",
    );
    // Replacing with 11 → projected 11, over the cap.
    const over = await files.put(APP_A, "a.bin", "application/octet-stream", bytes(11), null);
    expect(over.kind === "err" && over.error.kind).toBe("quota_exceeded");
  });

  // A quota read followed by an awaited write is a check-then-act across a yield point:
  // concurrent writers all pass the check before any of them commits, and the app lands
  // over its cap. The whole point of the cap is that a leaked share link cannot do this.
  test("50 concurrent puts cannot overshoot the byte cap", async () => {
    const files = createFilesService(db, { maxTotalBytesPerApp: 100 });
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        files.put(APP_A, `f${i}.bin`, "application/octet-stream", bytes(20), null),
      ),
    );
    const stored = await files.list(APP_A);
    expect(stored.reduce((n, f) => n + f.sizeBytes, 0)).toBeLessThanOrEqual(100);
  });
});

// A byte cap alone does not bound an app: an empty file still costs a row plus three
// index entries, and sums to zero against the cap. Only the count cap stops a leaked
// link from looping empty puts until the SQLite file (and its replica) is full.
describe("files per-app count quota", () => {
  test("zero-byte files are bounded by the count cap, which the byte cap cannot see", async () => {
    const files = createFilesService(db, { maxTotalBytesPerApp: 100, maxFilesPerApp: 3 });
    const empty = (path: string) =>
      files.put(APP_A, path, "application/octet-stream", bytes(0), null);
    expect((await empty("a.bin")).kind).toBe("ok");
    expect((await empty("b.bin")).kind).toBe("ok");
    expect((await empty("c.bin")).kind).toBe("ok");

    const over = await empty("d.bin");
    expect(over.kind === "err" && over.error.kind).toBe("quota_exceeded");

    // The cap is per-app: a different app is unaffected.
    expect((await files.put(APP_B, "a.bin", "application/octet-stream", bytes(0), null)).kind).toBe(
      "ok",
    );
  });

  test("replacing an existing path does not consume another count slot", async () => {
    const files = createFilesService(db, { maxFilesPerApp: 1 });
    expect((await files.put(APP_A, "a.bin", "application/octet-stream", bytes(1), null)).kind).toBe(
      "ok",
    );
    expect((await files.put(APP_A, "a.bin", "application/octet-stream", bytes(2), null)).kind).toBe(
      "ok",
    );
    const over = await files.put(APP_A, "b.bin", "application/octet-stream", bytes(1), null);
    expect(over.kind === "err" && over.error.kind).toBe("quota_exceeded");
  });

  test("50 concurrent puts cannot overshoot the file-count cap", async () => {
    const files = createFilesService(db, { maxFilesPerApp: 5 });
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        files.put(APP_A, `f${i}.bin`, "application/octet-stream", bytes(0), null),
      ),
    );
    expect((await files.list(APP_A)).length).toBe(5);
  });
});
