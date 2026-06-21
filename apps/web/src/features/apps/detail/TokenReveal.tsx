import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/app-url";

export const TokenReveal = ({ value }: { value: string }): React.ReactElement => {
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

  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted px-3 py-2.5 font-mono text-xs">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        onClick={() => void handleCopy()}
        aria-label="Copy"
      >
        {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      </Button>
    </div>
  );
};
