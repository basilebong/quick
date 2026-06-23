import type { AppSummary } from "@quick/app-hosting/shared";
import { ShareModeSchema } from "@quick/app-hosting/shared";
import * as v from "valibot";

import { jsonBody, requestJson } from "@/lib/http";

export const AppSummarySchema = v.object({
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  shareMode: ShareModeSchema,
  allowedEmails: v.array(v.string()),
  currentDeploymentId: v.nullable(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const AppListSchema = v.object({ apps: v.array(AppSummarySchema) });
const AppEnvelopeSchema = v.object({ app: AppSummarySchema });
const DeleteAppSchema = v.object({ id: v.string() });

export type CreateAppBody = {
  name: string;
  shareMode: AppSummary["shareMode"];
  slug: string;
};

export type UpdateAppBody = {
  name?: string;
  shareMode?: AppSummary["shareMode"];
  allowedEmails?: string[];
};

export const createApp = async (input: CreateAppBody): Promise<AppSummary> => {
  const body = await requestJson("/api/apps", AppEnvelopeSchema, jsonBody(input));
  return body.app;
};

export const deleteApp = async (appId: string): Promise<string> => {
  const body = await requestJson(`/api/apps/${encodeURIComponent(appId)}`, DeleteAppSchema, {
    method: "DELETE",
  });
  return body.id;
};

export const fetchApp = async (appId: string): Promise<AppSummary> => {
  const body = await requestJson(`/api/apps/${encodeURIComponent(appId)}`, AppEnvelopeSchema);
  return body.app;
};

export const fetchApps = async (): Promise<AppSummary[]> => {
  const body = await requestJson("/api/apps", AppListSchema);
  return [...body.apps];
};

export const updateApp = async (appId: string, input: UpdateAppBody): Promise<AppSummary> => {
  const body = await requestJson(`/api/apps/${encodeURIComponent(appId)}`, AppEnvelopeSchema, {
    ...jsonBody(input),
    method: "PATCH",
  });
  return body.app;
};
