import { ArrowClockwiseIcon, LightningIcon, PlusIcon } from "@phosphor-icons/react";
import type { AppSummary } from "@quick/app-hosting/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/features/apps/atoms/CopyButton";
import { ShareModeBadge } from "@/features/apps/atoms/ShareModeBadge";
import { appBaseUrl } from "@/lib/app-url";
import { fetchApps } from "@/lib/apps-api";
import { queryKeys } from "@/lib/query-keys";

const AppCard = ({ app }: { app: AppSummary }): React.ReactElement => {
  const baseUrl = appBaseUrl(app.slug);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <Link
            to="/apps/$appId"
            params={{ appId: app.id }}
            className="min-w-0 flex-1 outline-none"
          >
            <div className="truncate font-semibold text-base text-foreground">{app.name}</div>
            <div className="truncate text-muted-foreground text-sm">{baseUrl}</div>
          </Link>
          <ShareModeBadge mode={app.shareMode} />
        </div>
        <div className="flex items-center justify-between gap-2">
          {app.currentDeploymentId === null ? (
            <Badge variant="warning">Not deployed</Badge>
          ) : (
            <Badge variant="success">Live</Badge>
          )}
          <CopyButton value={baseUrl} label="Copy URL" size="sm" variant="outline" />
        </div>
      </CardContent>
    </Card>
  );
};

export const AppsScreen = (): React.ReactElement => {
  const apps = useQuery({ queryKey: queryKeys.apps, queryFn: fetchApps });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl text-foreground tracking-tight">Apps</h1>
        <Button asChild>
          <Link to="/apps/new">
            <PlusIcon size={16} weight="bold" />
            New app
          </Link>
        </Button>
      </div>

      {apps.isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : apps.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-muted-foreground text-sm">Couldn't load your apps.</p>
            <Button variant="outline" size="sm" onClick={() => void apps.refetch()}>
              <ArrowClockwiseIcon size={16} />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : apps.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
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
        <div className="flex flex-col gap-3">
          {apps.data.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
};
