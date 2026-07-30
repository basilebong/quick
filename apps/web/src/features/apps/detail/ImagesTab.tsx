import { ImageIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import type { AppSummary } from "@quick/app-hosting/shared";
import { SLOT_MAX_BYTES, type SlotView } from "@quick/app-hosting/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";
import { clearSlot, fetchSlots, fillSlot } from "@/lib/slots-api";

import { ConfirmDeleteButton } from "./ConfirmDeleteButton";

const DEFAULT_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif";

const SlotCard = ({ app, slot }: { app: AppSummary; slot: SlotView }): React.ReactElement => {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const fill = useMutation({
    mutationFn: (file: File) => fillSlot(app.id, slot.key, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.slots(app.id) });
      toast.success(`Uploaded "${slot.key}"`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't upload the image.");
    },
  });

  const clear = useMutation({
    mutationFn: () => clearSlot(app.id, slot.key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.slots(app.id) });
      toast.success(`Cleared "${slot.key}"`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't clear the image.");
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file !== undefined) fill.mutate(file);
  };

  const previewSrc = `/api/apps/${encodeURIComponent(app.id)}/slots/${encodeURIComponent(
    slot.key,
  )}?v=${slot.updatedAt}`;
  const cap = slot.maxBytes ?? SLOT_MAX_BYTES;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid aspect-video w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-muted sm:aspect-square sm:size-24">
          {slot.filled ? (
            <img
              src={previewSrc}
              alt={slot.label === "" ? slot.key : slot.label}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon size={28} className="text-muted-foreground" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {slot.label === "" ? slot.key : slot.label}
            </span>
            {slot.filled ? (
              <Badge variant="success">Filled</Badge>
            ) : (
              <Badge variant="secondary">Empty</Badge>
            )}
          </div>
          <code className="truncate text-muted-foreground text-xs">/_api/slots/{slot.key}</code>
          <p className="text-muted-foreground text-xs">
            {slot.filled && slot.sizeBytes !== null
              ? `${slot.contentType ?? "image"} · ${formatBytes(slot.sizeBytes)}`
              : `${slot.acceptMime ?? "PNG, JPEG, WebP, GIF, AVIF"} · up to ${formatBytes(cap)}`}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept={slot.acceptMime ?? DEFAULT_ACCEPT}
            className="hidden"
            onChange={onPick}
          />
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={fill.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <UploadSimpleIcon size={16} />
            {slot.filled ? "Replace" : "Upload"}
          </Button>
          {slot.filled ? (
            <ConfirmDeleteButton
              title="Clear this image?"
              description={
                <>
                  Remove the uploaded image from <span className="font-mono">{slot.key}</span>. The
                  slot stays and shows a placeholder until you upload again.
                </>
              }
              confirmLabel="Clear"
              disabled={clear.isPending}
              onConfirm={() => clear.mutate()}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export const ImagesTab = ({ app }: { app: AppSummary }): React.ReactElement => {
  const slots = useQuery({
    queryKey: queryKeys.slots(app.id),
    queryFn: () => fetchSlots(app.id),
  });

  if (slots.isPending) {
    return <div className="h-24 animate-pulse rounded-xl border bg-card" />;
  }
  if (slots.isError) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">Couldn't load image slots.</p>
    );
  }

  const active = slots.data.filter((s) => s.active);
  const inactive = slots.data.length - active.length;

  if (active.length === 0 && inactive === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary">
            <ImageIcon size={24} className="text-secondary-foreground" />
          </span>
          <div className="flex max-w-sm flex-col gap-1">
            <p className="font-medium text-foreground">No image slots</p>
            <p className="text-muted-foreground text-sm">
              Ask Claude to declare image slots when it deploys (the{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">slots</code> argument of{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">quick__deploy_files</code>),
              then upload the images here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {active.map((slot) => (
        <SlotCard key={slot.key} app={app} slot={slot} />
      ))}
      {inactive > 0 ? (
        <p className="px-1 pt-2 text-muted-foreground text-xs">
          {inactive} slot(s) the app no longer declares are hidden; their images are kept in case it
          declares them again.
        </p>
      ) : null}
    </div>
  );
};
