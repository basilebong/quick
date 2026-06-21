import type { Deployment } from "@quick/app-hosting/shared";
import * as v from "valibot";

import { requestJson } from "@/lib/http";

const DeploymentSchema = v.object({
  id: v.string(),
  version: v.number(),
  status: v.string(),
  fileCount: v.number(),
  totalBytes: v.number(),
  createdAt: v.number(),
});

const DeploymentListSchema = v.object({ deployments: v.array(DeploymentSchema) });
const DeploymentEnvelopeSchema = v.object({ deployment: DeploymentSchema });

export const activateDeployment = async (
  appId: string,
  deploymentId: string,
): Promise<Deployment> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/activate`,
    DeploymentEnvelopeSchema,
    { method: "POST" },
  );
  return body.deployment;
};

export const fetchDeployments = async (appId: string): Promise<Deployment[]> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/deployments`,
    DeploymentListSchema,
  );
  return [...body.deployments];
};
