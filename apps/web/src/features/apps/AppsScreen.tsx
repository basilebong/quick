import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  LightningIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import type { AppSummary } from "@quick/app-hosting/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArchivedBadge } from "@/features/apps/atoms/ArchivedBadge";
import { CopyButton } from "@/features/apps/atoms/CopyButton";
import { ShareModeBadge } from "@/features/apps/atoms/ShareModeBadge";
import { appBaseUrl } from "@/lib/app-url";
import { fetchApps, unarchiveApp } from "@/lib/apps-api";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";

const AppIdentityLink = ({ app }: { app: AppSummary }): React.ReactElement => {
  const host = appBaseUrl(app.slug).replace(/^https?:\/\//, "");
  const archived = app.archivedAt !== null;

  return (
    <Link
      to="/apps/$appId"
      params={{ appId: app.id }}
      className="flex items-start justify-between gap-3 rounded-t-xl p-4 outline-none focus-visible:bg-accent/40"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-border ring-inset transition-colors",
            archived
              ? "bg-muted text-muted-foreground"
              : "bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground",
          )}
        >
          <LightningIcon size={18} weight="fill" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{app.name}</div>
          <div className="truncate font-mono text-[12px] text-muted-foreground">{host}</div>
        </div>
      </div>
      {archived ? <ArchivedBadge /> : <ShareModeBadge mode={app.shareMode} />}
    </Link>
  );
};

const AppCard = ({ app }: { app: AppSummary }): React.ReactElement => {
  const baseUrl = appBaseUrl(app.slug);
  const live = app.currentDeploymentId !== null;

  return (
    <Card className="group gap-0 overflow-hidden p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md">
      <AppIdentityLink app={app} />
      <div className="flex items-center justify-between gap-2 border-border/70 border-t bg-muted/30 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", live ? "bg-emerald-500" : "bg-amber-500")}
          />
          <span className={cn("font-medium text-xs", live ? "text-emerald-700" : "text-amber-700")}>
            {live ? "Live" : "Not deployed"}
          </span>
        </span>
        <CopyButton value={baseUrl} label="Copy URL" size="sm" variant="ghost" />
      </div>
    </Card>
  );
};

const ArchivedAppCard = ({ app }: { app: AppSummary }): React.ReactElement => {
  const queryClient = useQueryClient();

  const restore = useMutation({
    mutationFn: () => unarchiveApp(app.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.apps });
      const previous = queryClient.getQueryData<AppSummary[]>(queryKeys.apps);
      queryClient.setQueryData<AppSummary[]>(queryKeys.apps, (old) =>
        old?.map((a) => (a.id === app.id ? { ...a, archivedAt: null } : a)),
      );
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.apps, context.previous);
      }
      toast.error(error instanceof ApiError ? error.message : "Couldn't restore the app.");
    },
    onSuccess: () => {
      toast.success("App restored");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.apps });
      await queryClient.invalidateQueries({ queryKey: queryKeys.app(app.id) });
    },
  });

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <AppIdentityLink app={app} />
      <div className="flex items-center justify-between gap-2 border-border/70 border-t bg-muted/30 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/50" />
          <span className="font-medium text-muted-foreground text-xs">Offline</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
        >
          <ArrowCounterClockwiseIcon size={16} />
          {restore.isPending ? "Restoring…" : "Restore"}
        </Button>
      </div>
    </Card>
  );
};

export const AppsScreen = (): React.ReactElement => {
  const apps = useQuery({ queryKey: queryKeys.apps, queryFn: fetchApps });

  const active = apps.data?.filter((a) => a.archivedAt === null) ?? [];
  const archived = apps.data?.filter((a) => a.archivedAt !== null) ?? [];
  const count = active.length;
  const subtitle =
    apps.data === undefined
      ? "Deploy a folder, get a secure URL to share."
      : `${count} ${count === 1 ? "app" : "apps"} · deploy a folder, get a secure URL to share.`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-semibold text-2xl text-foreground tracking-tight lg:text-[28px]">
            Apps
          </h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <Button asChild>
          <Link to="/apps/new">
            <PlusIcon size={16} weight="bold" />
            New app
          </Link>
        </Button>
      </div>

      {apps.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : apps.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-muted-foreground text-sm">Couldn't load your apps.</p>
            <Button variant="outline" size="sm" onClick={() => void apps.refetch()}>
              <ArrowClockwiseIcon size={16} />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : apps.data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary">
              <LightningIcon size={24} weight="fill" className="text-secondary-foreground" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground">No apps yet</p>
              <p className="max-w-xs text-muted-foreground text-sm">
                Create an app, then deploy a folder to it with the{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">quick</code> CLI.
              </p>
            </div>
            <Button asChild>
              <Link to="/apps/new">
                <PlusIcon size={16} weight="bold" />
                New app
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {active.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {active.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                Every app is archived. Restore one below to bring it back online.
              </CardContent>
            </Card>
          )}

          {archived.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-medium text-muted-foreground text-sm">
                Archived · {archived.length}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {archived.map((app) => (
                  <ArchivedAppCard key={app.id} app={app} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
};
