import { createHash } from "node:crypto";
import { join } from "node:path";
import type { AccessEntry, AppContext, Db, LinkValidation } from "@quick/core/server";
import { and, desc, eq } from "@quick/core/server/drizzle";
import { users } from "@quick/core/server/schema";
import {
  type AccessTokenId,
  type AppId,
  type DeploymentId,
  type Result,
  type ShareLinkId,
  type UserId,
  err,
  isUsableSlug,
  ok,
  parseShareLinkId,
  parseUserId,
} from "@quick/core/shared";
import { ulid } from "ulid";
import type {
  AccessLogEntry,
  AccessTokenView,
  AppSummary,
  CreateAppInput,
  CreateLinkInput,
  Deployment,
  HostingError,
  ShareLinkView,
  UpdateAppInput,
} from "../shared/index.ts";
import {
  DEPLOY_MAX_FILES,
  DEPLOY_MAX_TOTAL_BYTES,
  type DeployFile,
  isSafeDeployPath,
  removeAppDir,
  writeDeployment,
} from "./deploy.ts";
import { accessLog, accessTokens, apps, deployments, shareLinks } from "./schema.ts";
import {
  rowToAccessLogEntry,
  rowToAppContext,
  rowToAppSummary,
  rowToDeployment,
  rowToShareLinkView,
  rowToTokenView,
} from "./serialize.ts";
import { PAT_PREFIX, generateLinkToken, generatePat, hashToken } from "./tokens.ts";

export type HostingService = {
  // AppRegistry
  findBySlug(slug: string): Promise<AppContext | null>;
  // ShareResolver
  validateLinkToken(appId: AppId, rawToken: string): Promise<LinkValidation>;
  recordAccess(entry: AccessEntry): Promise<void>;
  // apps
  listApps(): Promise<AppSummary[]>;
  createApp(input: CreateAppInput, ownerId: UserId): Promise<Result<AppSummary, HostingError>>;
  getApp(appId: AppId): Promise<Result<AppSummary, HostingError>>;
  updateApp(appId: AppId, patch: UpdateAppInput): Promise<Result<AppSummary, HostingError>>;
  deleteApp(appId: AppId): Promise<Result<{ id: string; slug: string }, HostingError>>;
  // deployments
  listDeployments(appId: AppId): Promise<Deployment[]>;
  createDeployment(
    appId: AppId,
    files: DeployFile[],
    by: UserId,
  ): Promise<Result<Deployment, HostingError>>;
  activateDeployment(
    appId: AppId,
    deploymentId: DeploymentId,
  ): Promise<Result<Deployment, HostingError>>;
  // share links
  listLinks(appId: AppId): Promise<ShareLinkView[]>;
  createLink(
    appId: AppId,
    input: CreateLinkInput,
    by: UserId,
  ): Promise<Result<{ link: ShareLinkView; token: string }, HostingError>>;
  revokeLink(appId: AppId, linkId: ShareLinkId): Promise<Result<{ id: string }, HostingError>>;
  // access log
  listAccessLog(appId: AppId, limit: number): Promise<AccessLogEntry[]>;
  // personal access tokens (CLI)
  listTokens(ownerId: UserId): Promise<AccessTokenView[]>;
  createToken(
    ownerId: UserId,
    label: string,
  ): Promise<Result<{ token: string; view: AccessTokenView }, HostingError>>;
  revokeToken(ownerId: UserId, tokenId: AccessTokenId): Promise<Result<{ id: string }, HostingError>>;
  verifyAccessToken(
    rawToken: string,
  ): Promise<{ userId: UserId; email: string; name: string } | null>;
};

const deploymentChecksum = (files: DeployFile[]): string => {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path);
    h.update(f.bytes);
  }
  return h.digest("base64url");
};

const validateFiles = (files: DeployFile[]): HostingError | null => {
  if (files.length === 0) return { kind: "invalid_input", message: "no files in deployment" };
  if (files.length > DEPLOY_MAX_FILES) {
    return { kind: "invalid_input", message: `too many files (max ${DEPLOY_MAX_FILES})` };
  }
  let total = 0;
  for (const f of files) {
    if (!isSafeDeployPath(f.path)) {
      return { kind: "invalid_input", message: `unsafe file path: ${f.path}` };
    }
    total += f.bytes.byteLength;
  }
  if (total > DEPLOY_MAX_TOTAL_BYTES) {
    return { kind: "invalid_input", message: `deployment exceeds ${DEPLOY_MAX_TOTAL_BYTES} bytes` };
  }
  if (!files.some((f) => f.path === "index.html")) {
    return { kind: "invalid_input", message: "deployment must contain an index.html at the root" };
  }
  return null;
};

export const createHostingService = (db: Db, opts: { appsDir: string }): HostingService => {
  const appById = async (appId: AppId) => {
    const rows = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
    return rows[0];
  };

  return {
    async findBySlug(slug) {
      const rows = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1);
      const row = rows[0];
      return row === undefined ? null : rowToAppContext(row);
    },

    async validateLinkToken(appId, rawToken) {
      const rows = await db
        .select()
        .from(shareLinks)
        .where(and(eq(shareLinks.appId, appId), eq(shareLinks.tokenHash, hashToken(rawToken))))
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.revokedAt !== null) return { kind: "invalid" };
      const expiresAt = row.expiresAt.getTime();
      if (expiresAt <= Date.now()) return { kind: "expired" };
      await db.update(shareLinks).set({ lastUsedAt: new Date() }).where(eq(shareLinks.id, row.id));
      return { kind: "valid", linkId: parseShareLinkId(row.id), expiresAt };
    },

    async recordAccess(entry) {
      const viewer = entry.viewer;
      await db.insert(accessLog).values({
        id: ulid(),
        appId: entry.appId,
        mode: entry.mode,
        viewerKind: viewer === null ? null : viewer.kind,
        userId: viewer !== null && viewer.kind === "user" ? viewer.userId : null,
        linkId: viewer !== null && viewer.kind === "link" ? viewer.linkId : null,
        event: entry.event,
        path: entry.path,
        ip: entry.ip,
        userAgent: entry.userAgent,
        createdAt: new Date(),
      });
    },

    async listApps() {
      const rows = await db.select().from(apps).orderBy(desc(apps.createdAt));
      return rows.map(rowToAppSummary);
    },

    async createApp(input, ownerId) {
      if (!isUsableSlug(input.slug)) {
        return err({ kind: "invalid_input", message: "invalid or reserved slug" });
      }
      const existing = await db.select({ id: apps.id }).from(apps).where(eq(apps.slug, input.slug)).limit(1);
      if (existing[0] !== undefined) {
        return err({ kind: "conflict", message: `slug "${input.slug}" is already taken` });
      }
      const now = new Date();
      const inserted = await db
        .insert(apps)
        .values({
          id: ulid(),
          slug: input.slug,
          name: input.name,
          shareMode: input.shareMode,
          currentDeploymentId: null,
          ownerUserId: ownerId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok(rowToAppSummary(row));
    },

    async getApp(appId) {
      const row = await appById(appId);
      return row === undefined ? err({ kind: "not_found" }) : ok(rowToAppSummary(row));
    },

    async updateApp(appId, patch) {
      const set: { name?: string; shareMode?: string; updatedAt: Date } = { updatedAt: new Date() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.shareMode !== undefined) set.shareMode = patch.shareMode;
      const updated = await db.update(apps).set(set).where(eq(apps.id, appId)).returning();
      const row = updated[0];
      return row === undefined ? err({ kind: "not_found" }) : ok(rowToAppSummary(row));
    },

    async deleteApp(appId) {
      const row = await appById(appId);
      if (row === undefined) return err({ kind: "not_found" });
      await removeAppDir(opts.appsDir, row.slug);
      await db.delete(apps).where(eq(apps.id, appId));
      return ok({ id: row.id, slug: row.slug });
    },

    async listDeployments(appId) {
      const rows = await db
        .select()
        .from(deployments)
        .where(eq(deployments.appId, appId))
        .orderBy(desc(deployments.version));
      return rows.map(rowToDeployment);
    },

    async createDeployment(appId, files, by) {
      const bad = validateFiles(files);
      if (bad !== null) return err(bad);
      const app = await appById(appId);
      if (app === undefined) return err({ kind: "not_found" });

      const latest = await db
        .select({ version: deployments.version })
        .from(deployments)
        .where(eq(deployments.appId, appId))
        .orderBy(desc(deployments.version))
        .limit(1);
      const version = (latest[0]?.version ?? 0) + 1;
      const deploymentId = ulid();
      const totalBytes = files.reduce((sum, f) => sum + f.bytes.byteLength, 0);

      await writeDeployment(join(opts.appsDir, app.slug, deploymentId), files);

      const now = new Date();
      const inserted = await db
        .insert(deployments)
        .values({
          id: deploymentId,
          appId,
          version,
          status: "ready",
          fileCount: files.length,
          totalBytes,
          checksum: deploymentChecksum(files),
          createdByUserId: by,
          createdAt: now,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) return err({ kind: "not_found" });
      await db.update(apps).set({ currentDeploymentId: deploymentId, updatedAt: now }).where(eq(apps.id, appId));
      return ok(rowToDeployment(row));
    },

    async activateDeployment(appId, deploymentId) {
      const rows = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.id, deploymentId), eq(deployments.appId, appId)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return err({ kind: "not_found" });
      await db
        .update(apps)
        .set({ currentDeploymentId: deploymentId, updatedAt: new Date() })
        .where(eq(apps.id, appId));
      return ok(rowToDeployment(row));
    },

    async listLinks(appId) {
      const rows = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.appId, appId))
        .orderBy(desc(shareLinks.createdAt));
      const now = Date.now();
      return rows.map((r) => rowToShareLinkView(r, now));
    },

    async createLink(appId, input, by) {
      const app = await appById(appId);
      if (app === undefined) return err({ kind: "not_found" });
      const token = generateLinkToken();
      const now = new Date();
      const inserted = await db
        .insert(shareLinks)
        .values({
          id: ulid(),
          appId,
          label: input.label,
          tokenHash: hashToken(token),
          expiresAt: new Date(input.expiresAt),
          revokedAt: null,
          createdByUserId: by,
          createdAt: now,
          lastUsedAt: null,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok({ link: rowToShareLinkView(row, now.getTime()), token });
    },

    async revokeLink(appId, linkId) {
      const updated = await db
        .update(shareLinks)
        .set({ revokedAt: new Date() })
        .where(and(eq(shareLinks.id, linkId), eq(shareLinks.appId, appId)))
        .returning({ id: shareLinks.id });
      const row = updated[0];
      return row === undefined ? err({ kind: "not_found" }) : ok({ id: row.id });
    },

    async listAccessLog(appId, limit) {
      const rows = await db
        .select()
        .from(accessLog)
        .where(eq(accessLog.appId, appId))
        .orderBy(desc(accessLog.createdAt))
        .limit(limit);
      return rows.map(rowToAccessLogEntry);
    },

    async listTokens(ownerId) {
      const rows = await db
        .select()
        .from(accessTokens)
        .where(eq(accessTokens.ownerUserId, ownerId))
        .orderBy(desc(accessTokens.createdAt));
      return rows.map(rowToTokenView);
    },

    async createToken(ownerId, label) {
      const token = generatePat();
      const inserted = await db
        .insert(accessTokens)
        .values({
          id: ulid(),
          tokenHash: hashToken(token),
          ownerUserId: ownerId,
          label,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok({ token, view: rowToTokenView(row) });
    },

    async revokeToken(ownerId, tokenId) {
      const updated = await db
        .update(accessTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(accessTokens.id, tokenId), eq(accessTokens.ownerUserId, ownerId)))
        .returning({ id: accessTokens.id });
      const row = updated[0];
      return row === undefined ? err({ kind: "not_found" }) : ok({ id: row.id });
    },

    async verifyAccessToken(rawToken) {
      if (!rawToken.startsWith(PAT_PREFIX)) return null;
      const rows = await db
        .select()
        .from(accessTokens)
        .where(eq(accessTokens.tokenHash, hashToken(rawToken)))
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.revokedAt !== null) return null;
      const ownerRows = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, row.ownerUserId))
        .limit(1);
      const owner = ownerRows[0];
      if (owner === undefined) return null;
      await db.update(accessTokens).set({ lastUsedAt: new Date() }).where(eq(accessTokens.id, row.id));
      return { userId: parseUserId(owner.id), email: owner.email, name: owner.name };
    },
  };
};
