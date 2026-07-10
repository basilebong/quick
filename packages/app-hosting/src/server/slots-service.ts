import { createHash } from "node:crypto";
import type { Db } from "@quick/core/server";
import { and, asc, eq, inArray } from "@quick/core/server/drizzle";
import { type AppId, type Result, type UserId, err, ok } from "@quick/core/shared";
import { ulid } from "ulid";
import {
  type HostingError,
  SLOT_ALLOWED_MIME,
  SLOT_MAX_BYTES,
  type SlotDefinition,
  type SlotView,
  isValidSlotKey,
  sniffImageMime,
} from "../shared/index.ts";
import { type AppSlotRow, appSlots } from "./schema.ts";

export type SlotRead =
  | { kind: "filled"; contentType: string; checksum: string; bytes: Uint8Array }
  | { kind: "placeholder"; label: string }
  | { kind: "absent" };

export type SlotsService = {
  declareSlots(appId: AppId, defs: readonly SlotDefinition[]): Promise<void>;
  listSlots(appId: AppId, opts?: { includeInactive?: boolean }): Promise<SlotView[]>;
  fillSlot(
    appId: AppId,
    key: string,
    bytes: Uint8Array,
    by: UserId | null,
  ): Promise<Result<SlotView, HostingError>>;
  clearSlot(appId: AppId, key: string): Promise<Result<{ key: string }, HostingError>>;
  readSlot(appId: AppId, key: string): Promise<SlotRead>;
};

const checksumOf = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("base64url");

const META_COLUMNS = {
  key: appSlots.key,
  label: appSlots.label,
  acceptMime: appSlots.acceptMime,
  maxBytes: appSlots.maxBytes,
  active: appSlots.active,
  contentType: appSlots.contentType,
  sizeBytes: appSlots.sizeBytes,
  checksum: appSlots.checksum,
  updatedAt: appSlots.updatedAt,
};

type SlotMetaRow = Pick<
  AppSlotRow,
  | "key"
  | "label"
  | "acceptMime"
  | "maxBytes"
  | "active"
  | "contentType"
  | "sizeBytes"
  | "checksum"
  | "updatedAt"
>;

const rowToSlotView = (row: SlotMetaRow): SlotView => ({
  key: row.key,
  label: row.label,
  acceptMime: row.acceptMime,
  maxBytes: row.maxBytes,
  active: row.active,
  filled: row.checksum !== null,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  updatedAt: row.updatedAt.getTime(),
});

export const createSlotsService = (db: Db): SlotsService => ({
  async declareSlots(appId, defs) {
    const now = new Date();
    const declaredKeys = new Set(defs.map((d) => d.key));
    db.transaction((tx) => {
      for (const d of defs) {
        tx.insert(appSlots)
          .values({
            id: ulid(),
            appId,
            key: d.key,
            label: d.label ?? "",
            acceptMime: d.accept ?? null,
            maxBytes: d.maxBytes ?? null,
            active: true,
            storage: "inline",
            contentType: null,
            sizeBytes: null,
            checksum: null,
            blob: null,
            filledByUserId: null,
            filledAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [appSlots.appId, appSlots.key],
            set: {
              label: d.label ?? "",
              acceptMime: d.accept ?? null,
              maxBytes: d.maxBytes ?? null,
              active: true,
              updatedAt: now,
            },
          })
          .run();
      }
      const active = tx
        .select({ key: appSlots.key })
        .from(appSlots)
        .where(and(eq(appSlots.appId, appId), eq(appSlots.active, true)))
        .all();
      const stale = active.map((r) => r.key).filter((k) => !declaredKeys.has(k));
      if (stale.length > 0) {
        tx.update(appSlots)
          .set({ active: false, updatedAt: now })
          .where(and(eq(appSlots.appId, appId), inArray(appSlots.key, stale)))
          .run();
      }
    });
  },

  async listSlots(appId, opts) {
    const where =
      opts?.includeInactive === true
        ? eq(appSlots.appId, appId)
        : and(eq(appSlots.appId, appId), eq(appSlots.active, true));
    const rows = await db
      .select(META_COLUMNS)
      .from(appSlots)
      .where(where)
      .orderBy(asc(appSlots.key));
    return rows.map(rowToSlotView);
  },

  async fillSlot(appId, key, bytes, by) {
    if (!isValidSlotKey(key)) return err({ kind: "invalid_input", message: "invalid slot key" });
    const rows = await db
      .select({
        active: appSlots.active,
        acceptMime: appSlots.acceptMime,
        maxBytes: appSlots.maxBytes,
      })
      .from(appSlots)
      .where(and(eq(appSlots.appId, appId), eq(appSlots.key, key)))
      .limit(1);
    const row = rows[0];
    if (row === undefined || !row.active) return err({ kind: "not_found" });

    const sniffed = sniffImageMime(bytes);
    if (sniffed === null) {
      return err({
        kind: "unsupported_media_type",
        message: "unsupported image type (allowed: png, jpeg, gif, webp, avif)",
      });
    }
    const allowed = row.acceptMime !== null ? [row.acceptMime] : [...SLOT_ALLOWED_MIME];
    if (!allowed.includes(sniffed)) {
      return err({
        kind: "unsupported_media_type",
        message: `this slot accepts ${allowed.join(", ")}`,
      });
    }
    const cap = Math.min(row.maxBytes ?? SLOT_MAX_BYTES, SLOT_MAX_BYTES);
    if (bytes.byteLength > cap) {
      return err({ kind: "too_large", message: `image exceeds ${cap} bytes` });
    }

    const now = new Date();
    const updated = await db
      .update(appSlots)
      .set({
        storage: "inline",
        contentType: sniffed,
        sizeBytes: bytes.byteLength,
        checksum: checksumOf(bytes),
        blob: Buffer.from(bytes),
        filledByUserId: by,
        filledAt: now,
        updatedAt: now,
      })
      .where(and(eq(appSlots.appId, appId), eq(appSlots.key, key)))
      .returning(META_COLUMNS);
    const r = updated[0];
    if (r === undefined) return err({ kind: "not_found" });
    return ok(rowToSlotView(r));
  },

  async clearSlot(appId, key) {
    const updated = await db
      .update(appSlots)
      .set({
        storage: "inline",
        contentType: null,
        sizeBytes: null,
        checksum: null,
        blob: null,
        filledByUserId: null,
        filledAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(appSlots.appId, appId), eq(appSlots.key, key), eq(appSlots.active, true)))
      .returning({ key: appSlots.key });
    const r = updated[0];
    return r === undefined ? err({ kind: "not_found" }) : ok({ key: r.key });
  },

  async readSlot(appId, key) {
    if (!isValidSlotKey(key)) return { kind: "absent" };
    const rows = await db
      .select({
        active: appSlots.active,
        label: appSlots.label,
        blob: appSlots.blob,
        contentType: appSlots.contentType,
        checksum: appSlots.checksum,
      })
      .from(appSlots)
      .where(and(eq(appSlots.appId, appId), eq(appSlots.key, key)))
      .limit(1);
    const row = rows[0];
    if (row === undefined || !row.active) return { kind: "absent" };
    if (row.blob === null || row.contentType === null || row.checksum === null) {
      return { kind: "placeholder", label: row.label };
    }
    return {
      kind: "filled",
      contentType: row.contentType,
      checksum: row.checksum,
      bytes: row.blob,
    };
  },
});
