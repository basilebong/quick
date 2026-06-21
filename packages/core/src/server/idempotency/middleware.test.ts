import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Db } from "../db/index.ts";
import { withTestAuth } from "../test/index.ts";
import { createIdempotency } from "./middleware.ts";

const buildApp = (db: Db, userId: string) => {
  let creates = 0;
  const app = new Hono<{ Variables: { user: { id: string } } }>()
    .use("*", async (c, next) => {
      c.set("user", { id: userId });
      return next();
    })
    .use("*", createIdempotency(db))
    .post("/things", (c) => {
      creates += 1;
      return c.json({ seq: creates }, 201);
    })
    .post("/bad", (c) => c.json({ error: "nope" }, 400));

  const post = (path: string, key?: string) =>
    app.request(path, {
      method: "POST",
      headers: key === undefined ? {} : { "idempotency-key": key },
      body: "{}",
    });

  return { post, creates: () => creates };
};

describe("createIdempotency", () => {
  test("replays the stored response for a repeated key without re-running the handler", async () => {
    await withTestAuth({}, async ({ db }) => {
      const { post, creates } = buildApp(db, "user-1");

      const first = await post("/things", "k1");
      expect(first.status).toBe(201);
      expect(await first.json()).toEqual({ seq: 1 });

      const replay = await post("/things", "k1");
      expect(replay.status).toBe(201);
      expect(replay.headers.get("idempotent-replay")).toBe("true");
      expect(await replay.json()).toEqual({ seq: 1 });

      expect(creates()).toBe(1);
    });
  });

  test("a different key runs the handler again", async () => {
    await withTestAuth({}, async ({ db }) => {
      const { post, creates } = buildApp(db, "user-1");
      await post("/things", "k1");
      const second = await post("/things", "k2");
      expect(await second.json()).toEqual({ seq: 2 });
      expect(creates()).toBe(2);
    });
  });

  test("requests without an Idempotency-Key are never deduplicated", async () => {
    await withTestAuth({}, async ({ db }) => {
      const { post, creates } = buildApp(db, "user-1");
      await post("/things");
      await post("/things");
      expect(creates()).toBe(2);
    });
  });

  test("the key is scoped per user", async () => {
    await withTestAuth({}, async ({ db }) => {
      const a = buildApp(db, "user-1");
      const b = buildApp(db, "user-2");
      await a.post("/things", "shared");
      const other = await b.post("/things", "shared");
      expect(await other.json()).toEqual({ seq: 1 });
      expect(b.creates()).toBe(1);
    });
  });

  test("non-2xx responses are not cached, so the request can be retried", async () => {
    await withTestAuth({}, async ({ db }) => {
      const { post } = buildApp(db, "user-1");
      const first = await post("/bad", "k-bad");
      expect(first.status).toBe(400);
      const second = await post("/bad", "k-bad");
      expect(second.status).toBe(400);
      expect(second.headers.get("idempotent-replay")).toBeNull();
    });
  });
});
