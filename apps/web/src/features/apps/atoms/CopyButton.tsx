import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/app-url";

type CopyButtonProps = {
  value: string;
  label?: string;
  size?: "default" | "sm" | "icon-sm";
  variant?: "default" | "outline" | "secondary" | "ghost";
};

export const CopyButton = ({
  value,
  label = "Copy",
  size = "sm",
  variant = "outline",
}: CopyButtonProps): React.ReactElement => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await copyToClipboard(value);
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const isIcon = size === "icon-sm";

  return (
    <Button type="button" variant={variant} size={size} onClick={() => void handleCopy()}>
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      {isIcon ? <span className="sr-only">{label}</span> : label}
    </Button>
  );
};
