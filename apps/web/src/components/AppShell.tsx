import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useReconnectRefresh } from "@/hooks/useReconnectRefresh";

export const AppShell = (): ReactElement => {
  useReconnectRefresh();
  return (
    <>
      <OfflineIndicator />
      <Outlet />
    </>
  );
};
