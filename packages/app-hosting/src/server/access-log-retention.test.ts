import { describe, expect, test } from "bun:test";
import { createAccessLogRetention } from "./access-log-retention.ts";

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
});
