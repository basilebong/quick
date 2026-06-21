import { createMiddleware } from "hono/factory";
import type { Db } from "../db/index.ts";
import { eq, lt } from "../drizzle.ts";
import { idempotencyKeys } from "./schema.ts";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type IdentityVariables = { user: { id: string } };

export const createIdempotency = (db: Db, ttlMs: number = DEFAULT_TTL_MS) =>
  createMiddleware<{ Variables: IdentityVariables }>(async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (key === undefined || SAFE_METHODS.has(c.req.method)) return next();

    const userId = c.get("user").id;
    const id = `${userId}:${c.req.method}:${c.req.path}:${key}`;

    const cached = await db
      .select({ status: idempotencyKeys.responseStatus, body: idempotencyKeys.responseBody })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.id, id))
      .limit(1);
    const replay = cached[0];
    if (replay !== undefined) {
      return new Response(replay.body, {
        status: replay.status,
        headers: { "content-type": "application/json", "idempotent-replay": "true" },
      });
    }

    await next();

    const contentType = c.res.headers.get("content-type") ?? "";
    if (c.res.status < 200 || c.res.status >= 300 || !contentType.includes("application/json")) {
      return;
    }

    const body = await c.res.clone().text();
    await db
      .insert(idempotencyKeys)
      .values({
        id,
        userId,
        responseStatus: c.res.status,
        responseBody: body,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.createdAt, new Date(Date.now() - ttlMs)));
  });
