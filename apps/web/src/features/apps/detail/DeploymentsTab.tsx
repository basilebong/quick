import { RocketLaunchIcon, SparkleIcon } from "@phosphor-icons/react";
import type { AppSummary, Deployment } from "@quick/app-hosting/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { activateDeployment, fetchDeployments } from "@/lib/deployments-api";
import { formatBytes, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { queryKeys } from "@/lib/query-keys";

const DeployHint = (): React.ReactElement => (
  <Card>
    <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary">
        <SparkleIcon size={24} className="text-secondary-foreground" />
      </span>
      <div className="flex max-w-xs flex-col gap-1">
        <p className="font-medium text-foreground">No deployments yet</p>
        <p className="text-muted-foreground text-sm">
          Ask Claude to deploy this app over MCP with the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">quick__deploy_files</code> tool.
        </p>
      </div>
    </CardContent>
  </Card>
);

const DeploymentRow = ({
  app,
  deployment,
}: {
  app: AppSummary;
  deployment: Deployment;
}): React.ReactElement => {
  const queryClient = useQueryClient();
  const isCurrent = app.currentDeploymentId === deployment.id;

  const activate = useMutation({
    mutationFn: () => activateDeployment(app.id, deployment.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.app(app.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.deployments(app.id) });
      toast.success(`Activated version ${deployment.version}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't activate this version.");
    },
  });

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">Version {deployment.version}</span>
            {isCurrent ? <Badge variant="success">Current</Badge> : null}
          </div>
          <div className="text-muted-foreground text-xs">
            {deployment.fileCount} files · {formatBytes(deployment.totalBytes)} ·{" "}
            {formatDate(deployment.createdAt)}
          </div>
        </div>
        {isCurrent ? null : (
          <Button
            variant="outline"
            size="sm"
            disabled={activate.isPending}
            onClick={() => activate.mutate()}
          >
            <RocketLaunchIcon size={16} />
            Activate
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export const DeploymentsTab = ({ app }: { app: AppSummary }): React.ReactElement => {
  const deployments = useQuery({
    queryKey: queryKeys.deployments(app.id),
    queryFn: () => fetchDeployments(app.id),
  });

  if (deployments.isPending) {
    return <div className="h-24 animate-pulse rounded-xl border bg-card" />;
  }
  if (deployments.isError) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">Couldn't load deployments.</p>
    );
  }
  if (deployments.data.length === 0) {
    return <DeployHint />;
  }

  return (
    <div className="flex flex-col gap-3">
      {deployments.data.map((deployment) => (
        <DeploymentRow key={deployment.id} app={app} deployment={deployment} />
      ))}
    </div>
  );
};
