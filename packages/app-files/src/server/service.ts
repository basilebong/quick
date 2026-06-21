import { createHash } from "node:crypto";
import type { Db } from "@quick/core/server";
import { and, asc, eq, like } from "@quick/core/server/drizzle";
import { type AppId, type Result, type UserId, err, ok, parseAppFileId } from "@quick/core/shared";
import { ulid } from "ulid";
import {
  type AppFileMeta,
  type FilesError,
  MAX_FILE_BYTES,
  isValidFilePath,
} from "../shared/index.ts";
import { appFiles } from "./schema.ts";
import { rowToMeta } from "./serialize.ts";

export type AppFileContent = { meta: AppFileMeta; bytes: Uint8Array };

export type FilesService = {
  list(appId: AppId, prefix?: string): Promise<AppFileMeta[]>;
  put(
    appId: AppId,
    path: string,
    contentType: string,
    bytes: Uint8Array,
    by: UserId | null,
  ): Promise<Result<AppFileMeta, FilesError>>;
  get(appId: AppId, path: string): Promise<Result<AppFileContent, FilesError>>;
  remove(appId: AppId, path: string): Promise<Result<{ path: string }, FilesError>>;
};

const checksumOf = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("base64url");

export const createFilesService = (db: Db): FilesService => ({
  async list(appId, prefix) {
    const where =
      prefix !== undefined && prefix !== ""
        ? and(eq(appFiles.appId, appId), like(appFiles.path, `${prefix}%`))
        : eq(appFiles.appId, appId);
    const rows = await db.select().from(appFiles).where(where).orderBy(asc(appFiles.path));
    return rows.map(rowToMeta);
  },

  async put(appId, path, contentType, bytes, by) {
    if (!isValidFilePath(path)) return err({ kind: "invalid_input", message: "invalid file path" });
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return err({ kind: "too_large", message: `file exceeds ${MAX_FILE_BYTES} bytes` });
    }
    const now = new Date();
    const buf = Buffer.from(bytes);
    const checksum = checksumOf(bytes);
    const ct = contentType.trim() === "" ? "application/octet-stream" : contentType;

    const existing = await db
      .select({ id: appFiles.id })
      .from(appFiles)
      .where(and(eq(appFiles.appId, appId), eq(appFiles.path, path)))
      .limit(1);

    if (existing[0] !== undefined) {
      const updated = await db
        .update(appFiles)
        .set({
          contentType: ct,
          sizeBytes: bytes.byteLength,
          storage: "inline",
          blob: buf,
          checksum,
          updatedAt: now,
        })
        .where(and(eq(appFiles.appId, appId), eq(appFiles.path, path)))
        .returning();
      const row = updated[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok(rowToMeta(row));
    }

    const inserted = await db
      .insert(appFiles)
      .values({
        id: parseAppFileId(ulid()),
        appId,
        path,
        contentType: ct,
        sizeBytes: bytes.byteLength,
        storage: "inline",
        blob: buf,
        checksum,
        createdByUserId: by,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) return err({ kind: "not_found" });
    return ok(rowToMeta(row));
  },

  async get(appId, path) {
    if (!isValidFilePath(path)) return err({ kind: "invalid_input", message: "invalid file path" });
    const rows = await db
      .select()
      .from(appFiles)
      .where(and(eq(appFiles.appId, appId), eq(appFiles.path, path)))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return err({ kind: "not_found" });
    return ok({ meta: rowToMeta(row), bytes: row.blob ?? new Uint8Array() });
  },

  async remove(appId, path) {
    if (!isValidFilePath(path)) return err({ kind: "invalid_input", message: "invalid file path" });
    const deleted = await db
      .delete(appFiles)
      .where(and(eq(appFiles.appId, appId), eq(appFiles.path, path)))
      .returning({ path: appFiles.path });
    const row = deleted[0];
    if (row === undefined) return err({ kind: "not_found" });
    return ok({ path: row.path });
  },
});
