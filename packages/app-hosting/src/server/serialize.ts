import type { AppContext } from "@quick/core/server";
import { parseAppId, parseAppSlug, parseDeploymentId, type ShareMode } from "@quick/core/shared";
import type { AccessLogEntry, AppSummary, Deployment, ShareLinkView } from "../shared/index.ts";
import type { AccessLogRow, AppRow, DeploymentRow, ShareLinkRow } from "./schema.ts";

const shareModeOf = (raw: string): ShareMode => (raw === "link" ? "link" : "google");

export const rowToAppContext = (row: AppRow): AppContext => ({
  id: parseAppId(row.id),
  slug: parseAppSlug(row.slug),
  name: row.name,
  shareMode: shareModeOf(row.shareMode),
  currentDeploymentId:
    row.currentDeploymentId === null ? null : parseDeploymentId(row.currentDeploymentId),
  archived: row.archivedAt !== null,
});

export const rowToAppSummary = (row: AppRow, allowedEmails: string[]): AppSummary => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  shareMode: shareModeOf(row.shareMode),
  allowedEmails,
  currentDeploymentId: row.currentDeploymentId,
  archivedAt: row.archivedAt === null ? null : row.archivedAt.getTime(),
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});

export const rowToDeployment = (row: DeploymentRow): Deployment => ({
  id: row.id,
  version: row.version,
  status: row.status,
  fileCount: row.fileCount,
  totalBytes: row.totalBytes,
  createdAt: row.createdAt.getTime(),
});

export const rowToShareLinkView = (row: ShareLinkRow, now: number): ShareLinkView => {
  const expiresAt = row.expiresAt.getTime();
  const revokedAt = row.revokedAt === null ? null : row.revokedAt.getTime();
  const expired = expiresAt <= now;
  return {
    id: row.id,
    label: row.label,
    expiresAt,
    revokedAt,
    createdAt: row.createdAt.getTime(),
    lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.getTime(),
    expired,
    active: revokedAt === null && !expired,
  };
};

export const rowToAccessLogEntry = (row: AccessLogRow): AccessLogEntry => ({
  id: row.id,
  mode: shareModeOf(row.mode),
  viewerKind: row.viewerKind,
  userId: row.userId,
  linkId: row.linkId,
  event: row.event,
  path: row.path,
  createdAt: row.createdAt.getTime(),
});
