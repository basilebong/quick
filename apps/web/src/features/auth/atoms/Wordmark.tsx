import { LightningIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/cn";

type WordmarkProps = {
  size?: "lg" | "sm";
};

export const Wordmark = ({ size = "lg" }: WordmarkProps): React.ReactElement => (
  <div className="flex items-center gap-2.5">
    <div
      className={cn(
        "grid place-items-center rounded-[10px] bg-slate-900",
        size === "lg" ? "size-9" : "size-8",
      )}
    >
      <LightningIcon size={size === "lg" ? 20 : 18} weight="fill" className="text-white" />
    </div>
    <span
      className={cn(
        "font-semibold text-slate-900 tracking-tight",
        size === "lg" ? "text-[28px]" : "text-[20px]",
      )}
    >
      Quick
    </span>
  </div>
);
