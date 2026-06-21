import type { UserId } from "../../shared/index.ts";
import type { Db } from "../db/index.ts";
import { auditLog } from "./schema.ts";

export type AuditVia = "mcp" | "web";

export type AuditEntry = {
  userId: UserId;
  action: string;
  via: AuditVia;
  metadata?: Record<string, unknown>;
};

export type AuditRecorder = {
  record(entry: AuditEntry): Promise<void>;
};

export const createAuditRecorder = (db: Db): AuditRecorder => ({
  async record(entry) {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      userId: entry.userId,
      action: entry.action,
      via: entry.via,
      metadataJson: entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
      createdAt: new Date(),
    });
  },
});
