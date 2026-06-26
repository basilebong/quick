import { createHash } from "node:crypto";
import { join } from "node:path";
import type { AccessEntry, AppContext, Db, LinkValidation } from "@quick/core/server";
import { and, desc, eq } from "@quick/core/server/drizzle";
import { users } from "@quick/core/server/schema";
import {
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
  AppSummary,
  CreateAppInput,
  CreateLinkInput,
  Deployment,
  HostingError,
  ShareLinkView,
  UpdateAppInput,
} from "../shared/index.ts";
import { normalizeEmail } from "../shared/index.ts";
import {
  type DeployFile,
  readDeployment,
  removeAppDir,
  validateDeploymentFiles,
  writeDeployment,
} from "./deploy.ts";
import {
  accessLog,
  appAllowedEmails,
  appSessionCodes,
  appSessions,
  apps,
  deployments,
  shareLinks,
} from "./schema.ts";
import {
  rowToAccessLogEntry,
  rowToAppContext,
  rowToAppSummary,
  rowToDeployment,
  rowToShareLinkView,
} from "./serialize.ts";
import {
  generateAppSessionToken,
  generateLinkToken,
  generateSsoCode,
  hashToken,
} from "./tokens.ts";

export type HostingService = {
  // AppRegistry
  findBySlug(slug: string): Promise<AppContext | null>;
  // ShareResolver
  validateLinkToken(appId: AppId, rawToken: string): Promise<LinkValidation>;
  isEmailAllowedForApp(appId: AppId, email: string): Promise<boolean>;
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
  readCurrentDeploymentFiles(appId: AppId): Promise<DeployFile[]>;
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
  // per-app sessions (google mode) + the apex→tenant one-time-code handoff
  createSsoCode(appId: AppId, userId: UserId): Promise<string>;
  redeemSsoCode(rawCode: string, appId: AppId): Promise<{ userId: UserId } | null>;
  createAppSession(appId: AppId, userId: UserId): Promise<string>;
  validateAppSession(
    appId: AppId,
    rawToken: string,
  ): Promise<{ userId: UserId; email: string; name: string } | null>;
};

const SSO_CODE_TTL_MS = 60_000;
export const APP_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const deploymentChecksum = (files: DeployFile[]): string => {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path);
    h.update(f.bytes);
  }
  return h.digest("base64url");
};

export const createHostingService = (db: Db, opts: { appsDir: string }): HostingService => {
  const appById = async (appId: AppId) => {
    const rows = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
    return rows[0];
  };

  const allowedEmailsFor = async (appId: AppId): Promise<string[]> => {
    const rows = await db
      .select({ email: appAllowedEmails.email })
      .from(appAllowedEmails)
      .where(eq(appAllowedEmails.appId, appId));
    return rows.map((r) => r.email);
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

    async isEmailAllowedForApp(appId, email) {
      const allowed = await allowedEmailsFor(appId);
      return allowed.length === 0 || allowed.includes(normalizeEmail(email));
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

    // Not scoped by owner: allowlisted owners are co-equal operators who manage
    // every app. `ownerUserId` is attribution, not an authz boundary. See
    // .claude/rules/security.md (Owner gating).
    async listApps() {
      const rows = await db.select().from(apps).orderBy(desc(apps.createdAt));
      const emailRows = await db
        .select({ appId: appAllowedEmails.appId, email: appAllowedEmails.email })
        .from(appAllowedEmails);
      const byApp = new Map<string, string[]>();
      for (const { appId, email } of emailRows) {
        const list = byApp.get(appId);
        if (list === undefined) byApp.set(appId, [email]);
        else list.push(email);
      }
      return rows.map((row) => rowToAppSummary(row, byApp.get(row.id) ?? []));
    },

    async createApp(input, ownerId) {
      if (!isUsableSlug(input.slug)) {
        return err({ kind: "invalid_input", message: "invalid or reserved slug" });
      }
      const existing = await db
        .select({ id: apps.id })
        .from(apps)
        .where(eq(apps.slug, input.slug))
        .limit(1);
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
      return ok(rowToAppSummary(row, []));
    },

    async getApp(appId) {
      const row = await appById(appId);
      return row === undefined
        ? err({ kind: "not_found" })
        : ok(rowToAppSummary(row, await allowedEmailsFor(appId)));
    },

    async updateApp(appId, patch) {
      const current = await appById(appId);
      if (current === undefined) return err({ kind: "not_found" });
      const effectiveMode = patch.shareMode ?? current.shareMode;
      if (
        patch.allowedEmails !== undefined &&
        patch.allowedEmails.length > 0 &&
        effectiveMode !== "google"
      ) {
        return err({
          kind: "invalid_input",
          message: "An email allowlist applies only to google-mode apps.",
        });
      }
      const set: { name?: string; shareMode?: string; updatedAt: Date } = { updatedAt: new Date() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.shareMode !== undefined) set.shareMode = patch.shareMode;
      const updated = await db.update(apps).set(set).where(eq(apps.id, appId)).returning();
      const row = updated[0];
      if (row === undefined) return err({ kind: "not_found" });
      if (patch.allowedEmails !== undefined) {
        const emails = [...new Set(patch.allowedEmails.map(normalizeEmail))];
        const now = new Date();
        // Atomic replace: if the insert fails after the delete, a non-transactional
        // version would leave the allowlist empty — which reads as "any signed-in
        // Google account may view" (fail-open). bun:sqlite transactions are sync.
        db.transaction((tx) => {
          tx.delete(appAllowedEmails).where(eq(appAllowedEmails.appId, appId)).run();
          if (emails.length > 0) {
            tx.insert(appAllowedEmails)
              .values(emails.map((email) => ({ id: ulid(), appId, email, createdAt: now })))
              .run();
          }
        });
      }
      return ok(rowToAppSummary(row, await allowedEmailsFor(appId)));
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
      const bad = validateDeploymentFiles(files);
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
      await db
        .update(apps)
        .set({ currentDeploymentId: deploymentId, updatedAt: now })
        .where(eq(apps.id, appId));
      return ok(rowToDeployment(row));
    },

    async readCurrentDeploymentFiles(appId) {
      const app = await appById(appId);
      if (app === undefined || app.currentDeploymentId === null) return [];
      return readDeployment(join(opts.appsDir, app.slug, app.currentDeploymentId));
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

    async createSsoCode(appId, userId) {
      const code = generateSsoCode();
      await db.insert(appSessionCodes).values({
        id: ulid(),
        appId,
        userId,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + SSO_CODE_TTL_MS),
        createdAt: new Date(),
      });
      return code;
    },

    async redeemSsoCode(rawCode, appId) {
      const rows = await db
        .select()
        .from(appSessionCodes)
        .where(
          and(eq(appSessionCodes.appId, appId), eq(appSessionCodes.codeHash, hashToken(rawCode))),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      await db.delete(appSessionCodes).where(eq(appSessionCodes.id, row.id));
      if (row.expiresAt.getTime() <= Date.now()) return null;
      return { userId: parseUserId(row.userId) };
    },

    async createAppSession(appId, userId) {
      const token = generateAppSessionToken();
      await db.insert(appSessions).values({
        id: ulid(),
        appId,
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + APP_SESSION_TTL_MS),
        createdAt: new Date(),
        lastUsedAt: null,
      });
      return token;
    },

    async validateAppSession(appId, rawToken) {
      const rows = await db
        .select()
        .from(appSessions)
        .where(and(eq(appSessions.appId, appId), eq(appSessions.tokenHash, hashToken(rawToken))))
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.expiresAt.getTime() <= Date.now()) return null;
      const userRows = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, row.userId))
        .limit(1);
      const u = userRows[0];
      if (u === undefined) return null;
      await db
        .update(appSessions)
        .set({ lastUsedAt: new Date() })
        .where(eq(appSessions.id, row.id));
      return { userId: parseUserId(u.id), email: u.email, name: u.name };
    },
  };
};
