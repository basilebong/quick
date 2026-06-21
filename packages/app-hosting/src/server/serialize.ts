import type { AppContext } from "@quick/core/server";
import { type ShareMode, parseAppId, parseAppSlug, parseDeploymentId } from "@quick/core/shared";
import type {
  AccessLogEntry,
  AccessTokenView,
  AppSummary,
  Deployment,
  ShareLinkView,
} from "../shared/index.ts";
import type {
  AccessLogRow,
  AccessTokenRow,
  AppRow,
  DeploymentRow,
  ShareLinkRow,
} from "./schema.ts";

const shareModeOf = (raw: string): ShareMode => (raw === "link" ? "link" : "google");

export const rowToAppContext = (row: AppRow): AppContext => ({
  id: parseAppId(row.id),
  slug: parseAppSlug(row.slug),
  name: row.name,
  shareMode: shareModeOf(row.shareMode),
  currentDeploymentId:
    row.currentDeploymentId === null ? null : parseDeploymentId(row.currentDeploymentId),
});

export const rowToAppSummary = (row: AppRow): AppSummary => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  shareMode: shareModeOf(row.shareMode),
  currentDeploymentId: row.currentDeploymentId,
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
  ip: row.ip,
  createdAt: row.createdAt.getTime(),
});

export const rowToTokenView = (row: AccessTokenRow): AccessTokenView => ({
  id: row.id,
  label: row.label,
  createdAt: row.createdAt.getTime(),
  lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.getTime(),
  revokedAt: row.revokedAt === null ? null : row.revokedAt.getTime(),
});
