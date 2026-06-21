import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/index.ts";
import { and, eq, gt, lt } from "../drizzle.ts";
import { ssoCodes } from "./schema.ts";

const CODE_TTL_MS = 60 * 1000;

const hashCode = (raw: string): string => createHash("sha256").update(raw).digest("base64url");

export type SsoCodeFields = { appId: string; userId: string; email: string; name: string };

export type SsoCodeStore = {
  create(fields: SsoCodeFields): Promise<string>;
  consume(rawCode: string): Promise<SsoCodeFields | null>;
};

export const createSsoCodeStore = (db: Db): SsoCodeStore => ({
  async create(fields) {
    const raw = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.delete(ssoCodes).where(lt(ssoCodes.expiresAt, now));
    await db.insert(ssoCodes).values({
      id: crypto.randomUUID(),
      codeHash: hashCode(raw),
      appId: fields.appId,
      userId: fields.userId,
      userEmail: fields.email,
      userName: fields.name,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      createdAt: now,
    });
    return raw;
  },

  // Atomic single-use: deleting-returning means a second consume of the same
  // code finds nothing.
  async consume(rawCode) {
    if (rawCode === "") return null;
    const rows = await db
      .delete(ssoCodes)
      .where(and(eq(ssoCodes.codeHash, hashCode(rawCode)), gt(ssoCodes.expiresAt, new Date())))
      .returning();
    const row = rows[0];
    if (row === undefined) return null;
    return { appId: row.appId, userId: row.userId, email: row.userEmail, name: row.userName };
  },
});
