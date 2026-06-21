import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const REPLAY_SETTLE_MS = 5000;

export const useReconnectRefresh = (): void => {
  const queryClient = useQueryClient();
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (): void => {
      void queryClient.invalidateQueries();
    };
    const onOnline = (): void => {
      refresh();
      settleTimer = setTimeout(refresh, REPLAY_SETTLE_MS);
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      if (settleTimer !== undefined) clearTimeout(settleTimer);
    };
  }, [queryClient]);
};
