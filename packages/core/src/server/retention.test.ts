import { describe, expect, jest, spyOn, test } from "bun:test";
import { createRetentionSweeper } from "./retention.ts";

// Under fake timers the interval callback runs synchronously, so a sweep's promise
// chain only advances once the microtask queue is drained.
const settle = async (): Promise<void> => {
  for (let hop = 0; hop < 5; hop++) await Promise.resolve();
};

describe("retention sweeper", () => {
  test("sweeps immediately on start with a cutoff of now minus the ttl", async () => {
    const cutoffs: Date[] = [];
    const ttlMs = 30 * 24 * 60 * 60 * 1000;
    const sweeper = createRetentionSweeper({
      label: "widgets",
      ttlMs,
      intervalMs: 60_000,
      sweep: async (cutoff) => {
        cutoffs.push(cutoff);
        return 0;
      },
    });

    const before = Date.now();
    sweeper.start();
    const after = Date.now();
    await sweeper.close();

    expect(cutoffs).toHaveLength(1);
    const [cutoff] = cutoffs;
    if (cutoff === undefined) throw new Error("expected one sweep");
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - ttlMs);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - ttlMs);
  });

  test("a zero ttl sweeps everything already past its own deadline", async () => {
    const cutoffs: Date[] = [];
    const sweeper = createRetentionSweeper({
      label: "expired sessions",
      ttlMs: 0,
      intervalMs: 60_000,
      sweep: async (cutoff) => {
        cutoffs.push(cutoff);
        return 0;
      },
    });

    const before = Date.now();
    sweeper.start();
    const after = Date.now();
    await sweeper.close();

    const [cutoff] = cutoffs;
    if (cutoff === undefined) throw new Error("expected one sweep");
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after);
  });

  test("keeps sweeping on every interval tick, not just on start", async () => {
    jest.useFakeTimers();
    const cutoffs: Date[] = [];
    const intervalMs = 12 * 60 * 60 * 1000;
    const sweeper = createRetentionSweeper({
      label: "widgets",
      ttlMs: 30 * 24 * 60 * 60 * 1000,
      intervalMs,
      sweep: async (cutoff) => {
        cutoffs.push(cutoff);
        return 0;
      },
    });

    sweeper.start();
    await settle();
    expect(cutoffs).toHaveLength(1);

    for (let tick = 0; tick < 3; tick++) {
      jest.advanceTimersByTime(intervalMs);
      await settle();
    }
    await sweeper.close();
    jest.useRealTimers();

    expect(cutoffs).toHaveLength(4);
  });

  test("a tick landing on a still-running sweep does not start a second one", async () => {
    jest.useFakeTimers();
    const resolvers: Array<() => void> = [];
    const intervalMs = 12 * 60 * 60 * 1000;
    const sweeper = createRetentionSweeper({
      label: "widgets",
      ttlMs: 1000,
      intervalMs,
      sweep: () =>
        new Promise<number>((resolve) => {
          resolvers.push(() => resolve(0));
        }),
    });

    sweeper.start();
    jest.advanceTimersByTime(intervalMs * 2);
    await settle();
    expect(resolvers).toHaveLength(1);

    for (const resolve of resolvers) resolve();
    await sweeper.close();
    jest.useRealTimers();
  });

  test("start is idempotent: a second start does not trigger another sweep", async () => {
    let calls = 0;
    const sweeper = createRetentionSweeper({
      label: "widgets",
      ttlMs: 1000,
      intervalMs: 60_000,
      sweep: async () => {
        calls += 1;
        return 0;
      },
    });

    sweeper.start();
    sweeper.start();
    await sweeper.close();

    expect(calls).toBe(1);
  });

  test("close waits for an in-flight sweep before resolving", async () => {
    let resolveSweep: (() => void) | undefined;
    const sweeper = createRetentionSweeper({
      label: "widgets",
      ttlMs: 1000,
      intervalMs: 60_000,
      sweep: () =>
        new Promise<number>((resolve) => {
          resolveSweep = () => resolve(0);
        }),
    });

    sweeper.start();
    if (resolveSweep === undefined) throw new Error("expected a sweep to be in flight");

    let closed = false;
    const closing = sweeper.close().then(() => {
      closed = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(false);

    resolveSweep();
    await closing;
    expect(closed).toBe(true);
  });

  test("a failing sweep is contained: the sweeper keeps ticking", async () => {
    jest.useFakeTimers();
    const logged = spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const intervalMs = 60_000;
    const sweeper = createRetentionSweeper({
      label: "widgets",
      ttlMs: 1000,
      intervalMs,
      sweep: async () => {
        calls += 1;
        throw new Error("db is gone");
      },
    });

    sweeper.start();
    await settle();
    jest.advanceTimersByTime(intervalMs);
    await settle();
    await sweeper.close();
    jest.useRealTimers();

    expect(calls).toBe(2);
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });
});
