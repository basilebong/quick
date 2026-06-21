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

  test("personal access tokens verify back to the owner", async () => {
    const created = await service.createToken(owner, "ci");
    if (created.kind !== "ok") throw new Error("createToken failed");
    const resolved = await service.verifyAccessToken(created.value.token);
    expect(resolved?.email).toBe("owner@example.com");
    expect(await service.verifyAccessToken("quick_pat_bogus")).toBeNull();
    expect(await service.verifyAccessToken("not-even-a-pat")).toBeNull();
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
