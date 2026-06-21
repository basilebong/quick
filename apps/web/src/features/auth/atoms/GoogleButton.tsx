import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { GoogleG } from "./GoogleG";
import { Spinner } from "./Spinner";

type GoogleButtonProps = {
  variant?: "primary" | "outline";
  label?: string;
  loading?: boolean;
  loadingLabel?: string;
  onClick?: () => void;
  type?: "button" | "submit";
};

const baseClasses = "w-full min-h-12 rounded-2xl text-base font-medium gap-2.5";

export const GoogleButton = ({
  variant = "primary",
  label = "Continue with Google",
  loading = false,
  loadingLabel = "Signing in…",
  onClick,
  type = "button",
}: GoogleButtonProps): React.ReactElement => {
  if (loading) {
    return (
      <Button
        type={type}
        disabled
        className={cn(baseClasses, "bg-slate-900 text-white hover:bg-slate-900")}
      >
        <Spinner size={16} color="white" />
        {loadingLabel}
      </Button>
    );
  }

  if (variant === "primary") {
    return (
      <Button
        type={type}
        onClick={onClick}
        className={cn(
          baseClasses,
          "bg-slate-900 text-white hover:bg-slate-900/95 active:scale-[0.99]",
        )}
      >
        <span className="inline-grid size-5 place-items-center rounded-sm bg-white">
          <GoogleG size={14} />
        </span>
        {label}
      </Button>
    );
  }

  return (
    <Button
      type={type}
      onClick={onClick}
      variant="outline"
      className={cn(
        baseClasses,
        "border-slate-300 bg-white text-slate-900 hover:bg-slate-50 active:scale-[0.99]",
      )}
    >
      <GoogleG size={18} />
      {label}
    </Button>
  );
};
