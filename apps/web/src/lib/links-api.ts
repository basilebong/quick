import type { AccessLogEntry, ShareLinkView } from "@quick/app-hosting/shared";
import { ShareModeSchema } from "@quick/app-hosting/shared";
import * as v from "valibot";

import { jsonBody, requestJson } from "@/lib/http";

const ShareLinkViewSchema = v.object({
  id: v.string(),
  label: v.string(),
  expiresAt: v.number(),
  revokedAt: v.nullable(v.number()),
  createdAt: v.number(),
  lastUsedAt: v.nullable(v.number()),
  expired: v.boolean(),
  active: v.boolean(),
});

const AccessLogEntrySchema = v.object({
  id: v.string(),
  mode: ShareModeSchema,
  viewerKind: v.nullable(v.string()),
  userId: v.nullable(v.string()),
  linkId: v.nullable(v.string()),
  event: v.string(),
  path: v.string(),
  createdAt: v.number(),
});

const LinkListSchema = v.object({ links: v.array(ShareLinkViewSchema) });
const CreateLinkSchema = v.object({ link: ShareLinkViewSchema, token: v.string() });
const DeleteLinkSchema = v.object({ id: v.string() });
const AccessLogSchema = v.object({ entries: v.array(AccessLogEntrySchema) });

export type CreateLinkBody = {
  expiresAt: number;
  label: string;
};

export type CreatedLink = {
  link: ShareLinkView;
  token: string;
};

export const createLink = async (appId: string, input: CreateLinkBody): Promise<CreatedLink> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/links`,
    CreateLinkSchema,
    jsonBody(input),
  );
  return { link: body.link, token: body.token };
};

export const fetchAccessLog = async (appId: string): Promise<AccessLogEntry[]> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/access-log`,
    AccessLogSchema,
  );
  return [...body.entries];
};

export const fetchLinks = async (appId: string): Promise<ShareLinkView[]> => {
  const body = await requestJson(`/api/apps/${encodeURIComponent(appId)}/links`, LinkListSchema);
  return [...body.links];
};

export const revokeLink = async (appId: string, linkId: string): Promise<string> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/links/${encodeURIComponent(linkId)}`,
    DeleteLinkSchema,
    { method: "DELETE" },
  );
  return body.id;
};
