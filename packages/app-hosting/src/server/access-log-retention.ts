import type { HostingService } from "./service.ts";

const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type AccessLogPurger = Pick<HostingService, "purgeAccessLogOlderThan">;

export type AccessLogRetentionOptions = {
  service: AccessLogPurger;
  ttlMs: number;
  intervalMs?: number;
};

export type AccessLogRetention = {
  start(): void;
  close(): Promise<void>;
};

export const createAccessLogRetention = (opts: AccessLogRetentionOptions): AccessLogRetention => {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const sweep = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await opts.service.purgeAccessLogOlderThan(new Date(Date.now() - opts.ttlMs));
    } catch (error) {
      console.error("access-log retention sweep failed", error);
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        void sweep();
      }, intervalMs);
      void sweep();
    },
    close() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      return Promise.resolve();
    },
  };
};
