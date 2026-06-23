import { LightningIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/cn";

type WordmarkProps = {
  size?: "lg" | "sm";
  tone?: "default" | "invert";
  className?: string;
};

export const Wordmark = ({
  size = "lg",
  tone = "default",
  className,
}: WordmarkProps): React.ReactElement => (
  <div className={cn("flex items-center gap-2.5", className)}>
    <div
      className={cn(
        "grid place-items-center rounded-[10px]",
        size === "lg" ? "size-9" : "size-8",
        tone === "invert" ? "bg-white" : "bg-slate-900",
      )}
    >
      <LightningIcon
        size={size === "lg" ? 20 : 18}
        weight="fill"
        className={tone === "invert" ? "text-slate-900" : "text-white"}
      />
    </div>
    <span
      className={cn(
        "font-semibold tracking-tight",
        size === "lg" ? "text-[28px]" : "text-[20px]",
        tone === "invert" ? "text-white" : "text-slate-900",
      )}
    >
      Quick
    </span>
  </div>
);
