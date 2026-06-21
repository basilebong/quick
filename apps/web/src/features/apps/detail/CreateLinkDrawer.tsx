import { LinkIcon, PlusIcon } from "@phosphor-icons/react";
import type { AppSummary } from "@quick/app-hosting/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appBaseUrl, copyToClipboard } from "@/lib/app-url";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { createLink } from "@/lib/links-api";
import { queryKeys } from "@/lib/query-keys";

import { TokenReveal } from "./TokenReveal";

const defaultExpiry = (): string => {
  const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${sevenDays.getFullYear()}-${pad(sevenDays.getMonth() + 1)}-${pad(sevenDays.getDate())}T${pad(sevenDays.getHours())}:${pad(sevenDays.getMinutes())}`;
};

type CreatedState = {
  expiresAt: number;
  fullUrl: string;
};

export const CreateLinkDrawer = ({ app }: { app: AppSummary }): React.ReactElement => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [created, setCreated] = useState<CreatedState | null>(null);

  const reset = (): void => {
    setLabel("");
    setExpiry(defaultExpiry());
    setCreated(null);
  };

  const mutation = useMutation({
    mutationFn: () => {
      const expiresAt = new Date(expiry).getTime();
      return createLink(app.id, { label, expiresAt });
    },
    onSuccess: async ({ link, token }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.links(app.id) });
      const fullUrl = `${appBaseUrl(app.slug)}/?t=${token}`;
      setCreated({ fullUrl, expiresAt: link.expiresAt });
      try {
        await copyToClipboard(fullUrl);
        toast.success("Copied");
      } catch {
        toast.message("Link created — copy it below");
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't create the link.");
    },
  });

  const expiryMs = new Date(expiry).getTime();
  const expiryValid = Number.isFinite(expiryMs) && expiryMs > Date.now();

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) reset();
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button size="sm">
          <PlusIcon size={16} weight="bold" />
          Create link
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <LinkIcon size={18} weight="fill" />
              {created === null ? "Create a secret link" : "Link created"}
            </DrawerTitle>
            <DrawerDescription>
              {created === null
                ? "Anyone with this link can open the app until it expires."
                : "Copy it now — the token is shown only once."}
            </DrawerDescription>
          </DrawerHeader>

          {created === null ? (
            <div className="flex flex-col gap-4 px-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="link-label">Label</Label>
                <Input
                  id="link-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. Acme review"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="link-expiry">Expires</Label>
                <Input
                  id="link-expiry"
                  type="datetime-local"
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                />
                {!expiryValid ? (
                  <p className="text-destructive text-xs">Pick a date in the future.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4">
              <TokenReveal value={created.fullUrl} />
              <p className="text-muted-foreground text-xs">
                Expires {formatDate(created.expiresAt)}
              </p>
            </div>
          )}

          <DrawerFooter>
            {created === null ? (
              <>
                <Button
                  disabled={!expiryValid || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? "Creating…" : "Create link"}
                </Button>
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
              </>
            ) : (
              <DrawerClose asChild>
                <Button>Done</Button>
              </DrawerClose>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
