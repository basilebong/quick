import { ArrowLeftIcon } from "@phosphor-icons/react";
import { AppNameSchema, SlugSchema } from "@quick/app-hosting/shared";
import type { ShareMode } from "@quick/core/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApp } from "@/lib/apps-api";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";

const validateSlug = (slug: string): string | null => {
  const result = v.safeParse(SlugSchema, slug);
  return result.success ? null : "Use lowercase letters, numbers and hyphens (a valid DNS label).";
};

const validateName = (name: string): string | null => {
  const result = v.safeParse(AppNameSchema, name);
  return result.success ? null : "Enter a name (1–80 characters).";
};

export const CreateAppScreen = (): React.ReactElement => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [shareMode, setShareMode] = useState<ShareMode>("google");
  const [touched, setTouched] = useState(false);

  const slugError = validateSlug(slug);
  const nameError = validateName(name);

  const mutation = useMutation({
    mutationFn: () => createApp({ slug, name, shareMode }),
    onSuccess: async (app) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.apps });
      toast.success("App created");
      router.navigate({ to: "/apps/$appId", params: { appId: app.id } });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : "Couldn't create the app. Try again.";
      toast.error(message);
    },
  });

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (slugError !== null || nameError !== null) return;
    mutation.mutate();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" className="size-9">
          <Link to="/" aria-label="Back to apps">
            <ArrowLeftIcon size={18} />
          </Link>
        </Button>
        <h1 className="font-semibold text-2xl text-foreground tracking-tight">New app</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            placeholder="my-app"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            aria-invalid={touched && slugError !== null}
          />
          <p className="text-muted-foreground text-xs">
            Becomes the subdomain: <code className="rounded bg-muted px-1">{slug || "my-app"}</code>
            .yourdomain
          </p>
          {touched && slugError !== null ? (
            <p className="text-destructive text-xs">{slugError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My App"
            autoComplete="off"
            aria-invalid={touched && nameError !== null}
          />
          {touched && nameError !== null ? (
            <p className="text-destructive text-xs">{nameError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="share-mode">Sharing</Label>
          <Select
            value={shareMode}
            onValueChange={(value) => setShareMode(value === "link" ? "link" : "google")}
          >
            <SelectTrigger id="share-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google sign-in</SelectItem>
              <SelectItem value="link">Secret link</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {shareMode === "google"
              ? "Viewers sign in with Google; only allowed accounts can open the app."
              : "Anyone with an active secret link can open the app."}
          </p>
        </div>

        <Button type="submit" size="lg" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create app"}
        </Button>
      </form>
    </div>
  );
};
