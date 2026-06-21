import { CloudSlashIcon } from "@phosphor-icons/react";
import type { ReactElement } from "react";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export const OfflineIndicator = (): ReactElement | null => {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <output
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 text-center font-medium text-[13px] text-white"
    >
      <CloudSlashIcon size={16} weight="fill" aria-hidden />
      <span>Offline — changes will sync when you reconnect</span>
    </output>
  );
};
