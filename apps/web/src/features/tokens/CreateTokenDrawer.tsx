import { KeyIcon, PlusIcon } from "@phosphor-icons/react";
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
import { copyToClipboard } from "@/lib/app-url";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";
import { createToken } from "@/lib/tokens-api";

import { TokenReveal } from "@/features/apps/detail/TokenReveal";

export const CreateTokenDrawer = (): React.ReactElement => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const reset = (): void => {
    setLabel("");
    setToken(null);
  };

  const mutation = useMutation({
    mutationFn: () => createToken(label),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
      setToken(created.token);
      try {
        await copyToClipboard(created.token);
        toast.success("Copied");
      } catch {
        toast.message("Token created — copy it below");
      }
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't create the token.");
    },
  });

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) reset();
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button size="sm">
          <PlusIcon size={16} weight="bold" />
          Create token
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto flex w-full max-w-md flex-col">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <KeyIcon size={18} weight="fill" />
              {token === null ? "Create access token" : "Token created"}
            </DrawerTitle>
            <DrawerDescription>
              {token === null
                ? "Use this token to authenticate the quick CLI."
                : "Copy it now — it's shown only once."}
            </DrawerDescription>
          </DrawerHeader>

          {token === null ? (
            <div className="flex flex-col gap-1.5 px-4">
              <Label htmlFor="token-label">Label</Label>
              <Input
                id="token-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. laptop"
                autoComplete="off"
              />
            </div>
          ) : (
            <div className="px-4">
              <TokenReveal value={token} />
            </div>
          )}

          <DrawerFooter>
            {token === null ? (
              <>
                <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                  {mutation.isPending ? "Creating…" : "Create token"}
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
