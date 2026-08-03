const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type RetentionSweeperOptions = {
  label: string;
  ttlMs: number;
  sweep: (cutoff: Date) => Promise<number>;
  intervalMs?: number;
};

export type RetentionSweeper = {
  start(): void;
  close(): Promise<void>;
};

export const createRetentionSweeper = (opts: RetentionSweeperOptions): RetentionSweeper => {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<void> | null = null;

  const purge = async (): Promise<void> => {
    try {
      const purged = await opts.sweep(new Date(Date.now() - opts.ttlMs));
      if (purged > 0) console.info(`retention: purged ${purged} ${opts.label}`);
    } catch (error) {
      console.error(`retention sweep failed: ${opts.label}`, error);
    }
  };

  const sweep = (): Promise<void> => {
    if (inFlight !== null) return inFlight;
    const run = purge().finally(() => {
      inFlight = null;
    });
    inFlight = run;
    return run;
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
      return inFlight ?? Promise.resolve();
    },
  };
};
