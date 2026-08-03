import { lt } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { sessions } from "./schema.ts";

// Better Auth only drops an expired session row when that same browser comes back
// and presents the dead cookie, so a viewer who never returns would leave their
// ip_address + user_agent behind forever.
export const purgeExpiredSessions = async (db: Db, cutoff: Date): Promise<number> => {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, cutoff))
    .returning({ id: sessions.id });
  return deleted.length;
};
