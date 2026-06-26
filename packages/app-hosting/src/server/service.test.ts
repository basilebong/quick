import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@quick/core/server";
import { users } from "@quick/core/server/schema";
import { createTestDb } from "@quick/core/server/test";
import {
  type UserId,
  parseAppId,
  parseDeploymentId,
  parseShareLinkId,
  parseUserId,
} from "@quick/core/shared";
import { type HostingService, createHostingService } from "./service.ts";

let db: Db;
let appsDir: string;
let service: HostingService;
let owner: UserId;

const file = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) });

beforeEach(async () => {
  db = createTestDb();
  appsDir = mkdtempSync(join(tmpdir(), "quick-apps-"));
  service = createHostingService(db, { appsDir });
  owner = parseUserId("owner_1");
  await db.insert(users).values({
    id: owner,
    name: "Owner",
    email: "owner@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

afterEach(() => {
  rmSync(appsDir, { recursive: true, force: true });
});

const newApp = async (slug: string, shareMode: "google" | "link" = "link") => {
  const r = await service.createApp({ slug, name: slug, shareMode }, owner);
  if (r.kind !== "ok") throw new Error(`createApp failed: ${JSON.stringify(r.error)}`);
  return r.value;
};

describe("hosting service", () => {
  test("creates apps; rejects duplicates and reserved slugs", async () => {
    await newApp("acme");
    const dup = await service.createApp({ slug: "acme", name: "x", shareMode: "link" }, owner);
    expect(dup.kind === "err" && dup.error.kind).toBe("conflict");
    const reserved = await service.createApp({ slug: "api", name: "x", shareMode: "link" }, owner);
    expect(reserved.kind === "err" && reserved.error.kind).toBe("invalid_input");
  });

  test("deploy writes files to disk, versions, and rolls back", async () => {
    const app = await newApp("acme");
    const appId = parseAppId(app.id);

    const noIndex = await service.createDeployment(appId, [file("x.txt", "x")], owner);
    expect(noIndex.kind === "err" && noIndex.error.kind).toBe("invalid_input");

    const d1 = await service.createDeployment(
      appId,
      [file("index.html", "v1"), file("a/b.txt", "x")],
      owner,
    );
    if (d1.kind !== "ok") throw new Error("deploy 1 failed");
    expect(d1.value.version).toBe(1);
    expect(d1.value.fileCount).toBe(2);
    expect(existsSync(join(appsDir, "acme", d1.value.id, "index.html"))).toBe(true);
    expect(existsSync(join(appsDir, "acme", d1.value.id, "a", "b.txt"))).toBe(true);

    const d2 = await service.createDeployment(appId, [file("index.html", "v2")], owner);
    if (d2.kind !== "ok") throw new Error("deploy 2 failed");
    expect(d2.value.version).toBe(2);

    const afterDeploy = await service.getApp(appId);
    expect(afterDeploy.kind === "ok" && afterDeploy.value.currentDeploymentId).toBe(d2.value.id);

    await service.activateDeployment(appId, parseDeploymentId(d1.value.id));
    const afterRollback = await service.getApp(appId);
    expect(afterRollback.kind === "ok" && afterRollback.value.currentDeploymentId).toBe(
      d1.value.id,
    );
  });

  test("share links: validate, expire, revoke", async () => {
    const app = await newApp("acme");
    const appId = parseAppId(app.id);

    const live = await service.createLink(
      appId,
      { label: "client", expiresAt: Date.now() + 3_600_000 },
      owner,
    );
    if (live.kind !== "ok") throw new Error("createLink failed");
    expect((await service.validateLinkToken(appId, live.value.token)).kind).toBe("valid");
    expect((await service.validateLinkToken(appId, "wrong-token")).kind).toBe("invalid");

    const expired = await service.createLink(
      appId,
      { label: "old", expiresAt: Date.now() - 1_000 },
      owner,
    );
    if (expired.kind !== "ok") throw new Error("createLink expired failed");
    expect((await service.validateLinkToken(appId, expired.value.token)).kind).toBe("expired");

    await service.revokeLink(appId, parseShareLinkId(live.value.link.id));
    expect((await service.validateLinkToken(appId, live.value.token)).kind).toBe("invalid");
  });

  test("reads back the current deployment's files for editing", async () => {
    const app = await newApp("readable");
    const appId = parseAppId(app.id);
    await service.createDeployment(
      appId,
      [file("index.html", "<h1>hi</h1>"), file("assets/app.js", "const a = 1")],
      owner,
    );

    const files = await service.readCurrentDeploymentFiles(appId);
    const byPath = new Map(files.map((f) => [f.path, new TextDecoder().decode(f.bytes)]));
    expect(byPath.get("index.html")).toBe("<h1>hi</h1>");
    expect(byPath.get("assets/app.js")).toBe("const a = 1");

    const undeployed = await newApp("blank");
    expect(await service.readCurrentDeploymentFiles(parseAppId(undeployed.id))).toEqual([]);
  });

  test("reading files when the on-disk version dir is gone returns [] without throwing", async () => {
    const app = await newApp("vanished");
    const appId = parseAppId(app.id);
    const d = await service.createDeployment(appId, [file("index.html", "<h1>hi</h1>")], owner);
    if (d.kind !== "ok") throw new Error("deploy failed");
    rmSync(join(appsDir, "vanished", d.value.id), { recursive: true, force: true });

    expect(await service.readCurrentDeploymentFiles(appId)).toEqual([]);
  });

  test("renames an app (display name) without touching its slug", async () => {
    const app = await newApp("acme");
    const appId = parseAppId(app.id);
    const renamed = await service.updateApp(appId, { name: "Acme Corp" });
    if (renamed.kind !== "ok") throw new Error("rename failed");
    expect(renamed.value.name).toBe("Acme Corp");
    expect(renamed.value.slug).toBe("acme");
    const fetched = await service.getApp(appId);
    expect(fetched.kind === "ok" && fetched.value.name).toBe("Acme Corp");
  });

  test("updateApp on a missing app is not_found", async () => {
    const missing = await service.updateApp(parseAppId("app_missing"), { name: "x" });
    expect(missing.kind === "err" && missing.error.kind).toBe("not_found");
  });

  test("per-app email allowlist: replace, expose on summary, and enforce membership", async () => {
    const app = await newApp("acme", "google");
    const appId = parseAppId(app.id);

    expect(app.allowedEmails).toEqual([]);
    expect(await service.isEmailAllowedForApp(appId, "anyone@example.com")).toBe(true);

    const set = await service.updateApp(appId, {
      allowedEmails: ["client@example.com", "team@example.com"],
    });
    if (set.kind !== "ok") throw new Error("set allowlist failed");
    expect([...set.value.allowedEmails].sort()).toEqual(["client@example.com", "team@example.com"]);

    expect(await service.isEmailAllowedForApp(appId, "client@example.com")).toBe(true);
    expect(await service.isEmailAllowedForApp(appId, "CLIENT@example.com")).toBe(true);
    expect(await service.isEmailAllowedForApp(appId, "stranger@example.com")).toBe(false);

    const listed = (await service.listApps()).find((a) => a.id === app.id);
    expect(listed?.allowedEmails.length).toBe(2);

    const cleared = await service.updateApp(appId, { allowedEmails: [] });
    expect(cleared.kind === "ok" && cleared.value.allowedEmails).toEqual([]);
    expect(await service.isEmailAllowedForApp(appId, "stranger@example.com")).toBe(true);
  });

  test("an app's allowlist is scoped to that app", async () => {
    const a = await newApp("app-a", "google");
    const b = await newApp("app-b", "google");
    await service.updateApp(parseAppId(a.id), { allowedEmails: ["only-a@example.com"] });
    expect(await service.isEmailAllowedForApp(parseAppId(b.id), "only-a@example.com")).toBe(true);
    expect(await service.isEmailAllowedForApp(parseAppId(a.id), "only-a@example.com")).toBe(true);
    expect(await service.isEmailAllowedForApp(parseAppId(a.id), "only-b@example.com")).toBe(false);
  });

  test("rejects a non-empty allowlist on a non-google app; allows clearing and a combined switch to google", async () => {
    const app = await newApp("linkful", "link");
    const appId = parseAppId(app.id);

    const rejected = await service.updateApp(appId, { allowedEmails: ["x@example.com"] });
    expect(rejected.kind === "err" && rejected.error.kind).toBe("invalid_input");
    expect(await service.isEmailAllowedForApp(appId, "anyone@example.com")).toBe(true);

    const clearOk = await service.updateApp(appId, { allowedEmails: [] });
    expect(clearOk.kind).toBe("ok");

    const switched = await service.updateApp(appId, {
      shareMode: "google",
      allowedEmails: ["x@example.com"],
    });
    expect(switched.kind === "ok" && switched.value.allowedEmails).toEqual(["x@example.com"]);
    expect(await service.isEmailAllowedForApp(appId, "stranger@example.com")).toBe(false);
  });

  test("deleting an app removes its on-disk bundles", async () => {
    const app = await newApp("gone");
    const appId = parseAppId(app.id);
    await service.createDeployment(appId, [file("index.html", "x")], owner);
    expect(existsSync(join(appsDir, "gone"))).toBe(true);

    const del = await service.deleteApp(appId);
    expect(del.kind).toBe("ok");
    expect(existsSync(join(appsDir, "gone"))).toBe(false);
    expect((await service.getApp(appId)).kind).toBe("err");
  });
});
