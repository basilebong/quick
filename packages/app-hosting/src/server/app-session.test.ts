import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@quick/core/server";
import { users } from "@quick/core/server/schema";
import { createTestDb } from "@quick/core/server/test";
import { type AppId, type UserId, parseAppId, parseUserId } from "@quick/core/shared";
import { appSessionCodes, appSessions } from "./schema.ts";
import { type HostingService, createHostingService } from "./service.ts";
import { hashToken } from "./tokens.ts";

let db: Db;
let service: HostingService;
let owner: UserId;
let appId: AppId;

const otherApp = async (slug: string): Promise<AppId> => {
  const r = await service.createApp({ slug, name: slug, shareMode: "google" }, owner);
  if (r.kind !== "ok") throw new Error("createApp failed");
  return parseAppId(r.value.id);
};

beforeEach(async () => {
  db = createTestDb();
  service = createHostingService(db, { appsDir: mkdtempSync(join(tmpdir(), "quick-as-")) });
  owner = parseUserId("owner_1");
  await db.insert(users).values({
    id: owner,
    name: "Owner",
    email: "owner@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  appId = await otherApp("acme");
});

describe("sso codes", () => {
  test("a code is single-use and yields the bound user", async () => {
    const code = await service.createSsoCode(appId, owner);
    expect((await service.redeemSsoCode(code, appId))?.userId).toBe(owner);
    expect(await service.redeemSsoCode(code, appId)).toBeNull();
  });

  test("a code minted for one app cannot be redeemed by another, and is not consumed by the attempt", async () => {
    const other = await otherApp("other");
    const code = await service.createSsoCode(appId, owner);
    expect(await service.redeemSsoCode(code, other)).toBeNull();
    expect((await service.redeemSsoCode(code, appId))?.userId).toBe(owner);
  });

  test("an expired code is rejected (and consumed)", async () => {
    await db.insert(appSessionCodes).values({
      id: "code_expired",
      appId,
      userId: owner,
      codeHash: hashToken("rawexpired"),
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });
    expect(await service.redeemSsoCode("rawexpired", appId)).toBeNull();
  });
});

describe("app sessions", () => {
  test("validates, carries the user identity, and rejects a forged token", async () => {
    const token = await service.createAppSession(appId, owner);
    expect(await service.validateAppSession(appId, token)).toEqual({
      userId: owner,
      email: "owner@example.com",
      name: "Owner",
    });
    expect(await service.validateAppSession(appId, "not-a-real-token")).toBeNull();
  });

  test("a session for one app is not valid for another", async () => {
    const other = await otherApp("other2");
    const token = await service.createAppSession(appId, owner);
    expect(await service.validateAppSession(other, token)).toBeNull();
  });

  test("the token is stored only as a hash, never in plaintext", async () => {
    const token = await service.createAppSession(appId, owner);
    const rows = await db.select().from(appSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toBe(hashToken(token));
  });

  test("an expired session is rejected", async () => {
    await db.insert(appSessions).values({
      id: "sess_expired",
      appId,
      userId: owner,
      tokenHash: hashToken("rawexpired"),
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
      lastUsedAt: null,
    });
    expect(await service.validateAppSession(appId, "rawexpired")).toBeNull();
  });
});
