import { describe, expect, test } from "bun:test";
import type { Auth, Db } from "@quick/core/server";
import { withTestAuth } from "@quick/core/server/test";
import { parseAppId, parseUserId } from "@quick/core/shared";
import { createHostingService } from "./service.ts";
import { createSlotsService } from "./slots-service.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const NOT_IMAGE = new TextEncoder().encode("this is not an image");

const setup = async (ctx: { auth: Auth; db: Db }, slug = "acme") => {
  const authCtx = await ctx.auth.$context;
  const user = await authCtx.internalAdapter.createUser({
    name: "Owner",
    email: `o-${slug}@x.com`,
  });
  const actor = parseUserId(user.id);
  const hosting = createHostingService(ctx.db, { appsDir: "/tmp/quick-slots-unused" });
  const created = await hosting.createApp({ slug, name: slug, shareMode: "google" }, actor);
  if (created.kind !== "ok") throw new Error("createApp failed");
  return { appId: parseAppId(created.value.id), actor, slots: createSlotsService(ctx.db) };
};

describe("SlotsService.declareSlots + listSlots", () => {
  test("declares empty active slots that list as unfilled", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, slots } = await setup(ctx);
      await slots.declareSlots(appId, [{ key: "hero", label: "Hero" }, { key: "logo" }]);
      const list = await slots.listSlots(appId);
      expect(list.map((s) => s.key)).toEqual(["hero", "logo"]);
      expect(list.every((s) => s.filled === false && s.active === true)).toBe(true);
      expect(list.find((s) => s.key === "hero")?.label).toBe("Hero");
    });
  });

  test("re-declaring keeps filled bytes, deactivates removed slots, and can restore them", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, actor, slots } = await setup(ctx);
      await slots.declareSlots(appId, [{ key: "hero" }, { key: "logo" }]);
      expect((await slots.fillSlot(appId, "hero", PNG, actor)).kind).toBe("ok");
      expect((await slots.fillSlot(appId, "logo", PNG, actor)).kind).toBe("ok");

      await slots.declareSlots(appId, [{ key: "hero" }]);
      expect((await slots.listSlots(appId)).map((s) => s.key)).toEqual(["hero"]);
      const all = await slots.listSlots(appId, { includeInactive: true });
      expect(all.find((s) => s.key === "logo")?.active).toBe(false);
      expect((await slots.readSlot(appId, "hero")).kind).toBe("filled");

      await slots.declareSlots(appId, [{ key: "hero" }, { key: "logo" }]);
      const restored = await slots.readSlot(appId, "logo");
      expect(restored.kind).toBe("filled");
    });
  });

  test("declaring an empty set deactivates every slot", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, slots } = await setup(ctx);
      await slots.declareSlots(appId, [{ key: "a" }, { key: "b" }]);
      await slots.declareSlots(appId, []);
      expect(await slots.listSlots(appId)).toEqual([]);
      expect((await slots.listSlots(appId, { includeInactive: true })).length).toBe(2);
    });
  });

  test("slots are scoped per app", async () => {
    await withTestAuth({}, async (ctx) => {
      const a = await setup(ctx, "one");
      const b = await setup(ctx, "two");
      await a.slots.declareSlots(a.appId, [{ key: "hero" }]);
      expect(await b.slots.listSlots(b.appId)).toEqual([]);
    });
  });
});

describe("SlotsService.fillSlot", () => {
  const withHero = async (
    ctx: { auth: Auth; db: Db },
    def: { accept?: string; maxBytes?: number } = {},
  ) => {
    const s = await setup(ctx);
    await s.slots.declareSlots(s.appId, [{ key: "hero", ...def }]);
    return s;
  };

  test("stores a valid image, sniffs its type, and marks the slot filled", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, actor, slots } = await withHero(ctx);
      const r = await slots.fillSlot(appId, "hero", PNG, actor);
      expect(r.kind).toBe("ok");
      if (r.kind !== "ok") throw new Error("expected ok");
      expect(r.value.filled).toBe(true);
      expect(r.value.contentType).toBe("image/png");
      expect(r.value.sizeBytes).toBe(PNG.byteLength);

      const read = await slots.readSlot(appId, "hero");
      expect(read.kind).toBe("filled");
      if (read.kind !== "filled") throw new Error("expected filled");
      expect(read.contentType).toBe("image/png");
      expect(Buffer.from(read.bytes).equals(Buffer.from(PNG))).toBe(true);
    });
  });

  test("rejects a non-image (415)", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, actor, slots } = await withHero(ctx);
      const r = await slots.fillSlot(appId, "hero", NOT_IMAGE, actor);
      expect(r.kind === "err" && r.error.kind).toBe("unsupported_media_type");
    });
  });

  test("enforces a per-slot accept type (415)", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, actor, slots } = await withHero(ctx, { accept: "image/png" });
      const r = await slots.fillSlot(appId, "hero", JPEG, actor);
      expect(r.kind === "err" && r.error.kind).toBe("unsupported_media_type");
    });
  });

  test("enforces a per-slot byte cap (413)", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, actor, slots } = await withHero(ctx, { maxBytes: 4 });
      const r = await slots.fillSlot(appId, "hero", PNG, actor);
      expect(r.kind === "err" && r.error.kind).toBe("too_large");
    });
  });

  test("rejects an unknown or inactive slot (404)", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, actor, slots } = await withHero(ctx);
      const r = await slots.fillSlot(appId, "ghost", PNG, actor);
      expect(r.kind === "err" && r.error.kind).toBe("not_found");
    });
  });
});

describe("SlotsService.clearSlot + readSlot", () => {
  test("clearing a filled slot returns it to a placeholder", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, actor, slots } = await setup(ctx);
      await slots.declareSlots(appId, [{ key: "hero", label: "Hero" }]);
      await slots.fillSlot(appId, "hero", PNG, actor);

      const cleared = await slots.clearSlot(appId, "hero");
      expect(cleared.kind).toBe("ok");
      const read = await slots.readSlot(appId, "hero");
      expect(read.kind).toBe("placeholder");
      if (read.kind !== "placeholder") throw new Error("expected placeholder");
      expect(read.label).toBe("Hero");
    });
  });

  test("readSlot returns absent for unknown or invalid keys", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, slots } = await setup(ctx);
      expect((await slots.readSlot(appId, "nope")).kind).toBe("absent");
      expect((await slots.readSlot(appId, "Bad Key")).kind).toBe("absent");
    });
  });

  test("clearing an unknown slot is not_found", async () => {
    await withTestAuth({}, async (ctx) => {
      const { appId, slots } = await setup(ctx);
      const r = await slots.clearSlot(appId, "nope");
      expect(r.kind === "err" && r.error.kind).toBe("not_found");
    });
  });
});
