import { describe, expect, jest, test } from "bun:test";
import { createAccessLogRetention } from "./access-log-retention.ts";

// Under fake timers the interval callback runs synchronously, so a sweep's promise
// chain only advances once the microtask queue is drained.
const settle = async (): Promise<void> => {
  for (let hop = 0; hop < 5; hop++) await Promise.resolve();
};

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

  test("keeps sweeping on every interval tick, not just on start", async () => {
    jest.useFakeTimers();
    const cutoffs: Date[] = [];
    const intervalMs = 12 * 60 * 60 * 1000;
    const retention = createAccessLogRetention({
      service: {
        purgeAccessLogOlderThan: async (cutoff) => {
          cutoffs.push(cutoff);
          return 0;
        },
      },
      ttlMs: 30 * 24 * 60 * 60 * 1000,
      intervalMs,
    });

    retention.start();
    await settle();
    expect(cutoffs).toHaveLength(1);

    for (let tick = 0; tick < 3; tick++) {
      jest.advanceTimersByTime(intervalMs);
      await settle();
    }
    await retention.close();
    jest.useRealTimers();

    expect(cutoffs).toHaveLength(4);
  });

  test("a tick landing on a still-running sweep does not start a second one", async () => {
    jest.useFakeTimers();
    const resolvers: Array<() => void> = [];
    const intervalMs = 12 * 60 * 60 * 1000;
    const retention = createAccessLogRetention({
      service: {
        purgeAccessLogOlderThan: () =>
          new Promise<number>((resolve) => {
            resolvers.push(() => resolve(0));
          }),
      },
      ttlMs: 30 * 24 * 60 * 60 * 1000,
      intervalMs,
    });

    retention.start();
    jest.advanceTimersByTime(intervalMs * 2);
    await settle();
    expect(resolvers).toHaveLength(1);

    for (const resolve of resolvers) resolve();
    await retention.close();
    jest.useRealTimers();
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
});
