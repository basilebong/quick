import { and, eq, notExists } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { oauthClientResources, oauthClients } from "./schema.ts";

// The OAuth provider only lets a client request a resource it is linked to, and only
// links clients at registration. Clients registered before the provider persisted those
// links (better-auth < 1.7) have none, so this links every unlinked client to the MCP
// resource — the only audience Quick has ever issued tokens for. Requires the resource
// row, which the provider seeds when `auth.$context` initializes.
export const linkOAuthClientsToResource = async (db: Db, resource: string): Promise<number> => {
  const unlinked = await db
    .select({ clientId: oauthClients.clientId })
    .from(oauthClients)
    .where(
      notExists(
        db
          .select({ id: oauthClientResources.id })
          .from(oauthClientResources)
          .where(
            and(
              eq(oauthClientResources.clientId, oauthClients.clientId),
              eq(oauthClientResources.resourceId, resource),
            ),
          ),
      ),
    );
  if (unlinked.length === 0) return 0;

  const createdAt = new Date();
  await db
    .insert(oauthClientResources)
    .values(
      unlinked.map(({ clientId }) => ({
        id: crypto.randomUUID(),
        clientId,
        resourceId: resource,
        createdAt,
      })),
    )
    .onConflictDoNothing();
  return unlinked.length;
};
