import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/features/apps/atoms/CopyButton";
import { ShareModeBadge } from "@/features/apps/atoms/ShareModeBadge";
import { AccessLogTab } from "@/features/apps/detail/AccessLogTab";
import { DataTab } from "@/features/apps/detail/DataTab";
import { DeploymentsTab } from "@/features/apps/detail/DeploymentsTab";
import { FilesTab } from "@/features/apps/detail/FilesTab";
import { SettingsTab } from "@/features/apps/detail/SettingsTab";
import { SharingTab } from "@/features/apps/detail/SharingTab";
import { appBaseUrl } from "@/lib/app-url";
import { fetchApp } from "@/lib/apps-api";
import { queryKeys } from "@/lib/query-keys";

const TABS = [
  { value: "deployments", label: "Deployments" },
  { value: "sharing", label: "Sharing" },
  { value: "data", label: "Data" },
  { value: "files", label: "Files" },
  { value: "access", label: "Access log" },
  { value: "settings", label: "Settings" },
] as const;

export const AppDetailScreen = ({ appId }: { appId: string }): React.ReactElement => {
  const app = useQuery({ queryKey: queryKeys.app(appId), queryFn: () => fetchApp(appId) });

  if (app.isPending) {
    return (
      <div className="flex flex-col gap-5">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (app.isError || app.data === undefined) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-muted-foreground text-sm">This app could not be found.</p>
        <Button asChild variant="outline">
          <Link to="/">Back to apps</Link>
        </Button>
      </div>
    );
  }

  const current = app.data;
  const baseUrl = appBaseUrl(current.slug);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link to="/">
            <ArrowLeftIcon size={16} />
            Apps
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-semibold text-2xl text-foreground tracking-tight">
                {current.name}
              </h1>
              <ShareModeBadge mode={current.shareMode} />
            </div>
            <a
              href={baseUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-muted-foreground text-sm hover:text-foreground"
            >
              {baseUrl}
            </a>
          </div>
          <CopyButton value={baseUrl} label="Copy URL" size="sm" variant="outline" />
        </div>
      </div>

      <Tabs defaultValue="deployments">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="deployments">
          <DeploymentsTab app={current} />
        </TabsContent>
        <TabsContent value="sharing">
          <SharingTab app={current} />
        </TabsContent>
        <TabsContent value="data">
          <DataTab app={current} />
        </TabsContent>
        <TabsContent value="files">
          <FilesTab app={current} />
        </TabsContent>
        <TabsContent value="access">
          <AccessLogTab app={current} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab app={current} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
