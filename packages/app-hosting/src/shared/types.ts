import type { ShareMode } from "@quick/core/shared";

export type AppSummary = {
  id: string;
  slug: string;
  name: string;
  shareMode: ShareMode;
  allowedEmails: string[];
  currentDeploymentId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Deployment = {
  id: string;
  version: number;
  status: string;
  fileCount: number;
  totalBytes: number;
  createdAt: number;
};

export type ShareLinkView = {
  id: string;
  label: string;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
  lastUsedAt: number | null;
  expired: boolean;
  active: boolean;
};

export type AccessLogEntry = {
  id: string;
  mode: ShareMode;
  viewerKind: string | null;
  userId: string | null;
  linkId: string | null;
  event: string;
  path: string;
  ip: string | null;
  createdAt: number;
};

export type AccessTokenView = {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};
