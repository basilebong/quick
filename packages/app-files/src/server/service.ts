import { createHash } from "node:crypto";
import type { Db } from "@quick/core/server";
import { and, asc, count, eq, like, sum } from "@quick/core/server/drizzle";
import { type AppId, err, ok, parseAppFileId, type Result, type UserId } from "@quick/core/shared";
import { ulid } from "ulid";
import {
  type AppFileMeta,
  type FilesError,
  isValidFilePath,
  MAX_FILE_BYTES,
  MAX_FILES_PER_APP,
  MAX_FILES_TOTAL_BYTES_PER_APP,
} from "../shared/index.ts";
import { appFiles } from "./schema.ts";
import { metaColumns, rowToMeta } from "./serialize.ts";

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

export type FilesLimits = { maxFilesPerApp?: number; maxTotalBytesPerApp?: number };

export const createFilesService = (db: Db, limits: FilesLimits = {}): FilesService => {
  const maxFilesPerApp = limits.maxFilesPerApp ?? MAX_FILES_PER_APP;
  const maxTotalBytesPerApp = limits.maxTotalBytesPerApp ?? MAX_FILES_TOTAL_BYTES_PER_APP;

  const overFileCap: FilesError = {
    kind: "quota_exceeded",
    message: `app has reached its ${maxFilesPerApp}-file limit`,
  };
  const overByteCap: FilesError = {
    kind: "quota_exceeded",
    message: `app has reached its ${maxTotalBytesPerApp}-byte storage limit`,
  };

  return {
    async list(appId, prefix) {
      const where =
        prefix !== undefined && prefix !== ""
          ? and(eq(appFiles.appId, appId), like(appFiles.path, `${prefix}%`))
          : eq(appFiles.appId, appId);
      const rows = await db
        .select(metaColumns)
        .from(appFiles)
        .where(where)
        .orderBy(asc(appFiles.path));
      return rows.map(rowToMeta);
    },

    async put(appId, path, contentType, bytes, by) {
      if (!isValidFilePath(path))
        return err({ kind: "invalid_input", message: "invalid file path" });
      if (bytes.byteLength > MAX_FILE_BYTES) {
        return err({ kind: "too_large", message: `file exceeds ${MAX_FILE_BYTES} bytes` });
      }
      const now = new Date();
      const buf = Buffer.from(bytes);
      const checksum = checksumOf(bytes);
      const ct = contentType.trim() === "" ? "application/octet-stream" : contentType;
      const atPath = and(eq(appFiles.appId, appId), eq(appFiles.path, path));

      // Reading the quota and writing the blob must be ONE atomic step. Split across an
      // `await`, concurrent writers each pass the check before any of them commits and
      // the app overshoots its cap by the number of writers in flight. bun:sqlite
      // transactions are synchronous, so nothing can interleave inside this callback.
      return db.transaction((tx) => {
        const existing = tx
          .select({ id: appFiles.id, sizeBytes: appFiles.sizeBytes })
          .from(appFiles)
          .where(atPath)
          .limit(1)
          .all();
        const before = existing[0];

        // Only a new path consumes a count slot; replacing one in place does not.
        if (before === undefined) {
          const counted = tx
            .select({ n: count() })
            .from(appFiles)
            .where(eq(appFiles.appId, appId))
            .all();
          if ((counted[0]?.n ?? 0) >= maxFilesPerApp) return err(overFileCap);
        }

        const usedRows = tx
          .select({ total: sum(appFiles.sizeBytes) })
          .from(appFiles)
          .where(eq(appFiles.appId, appId))
          .all();
        const used = Number(usedRows[0]?.total ?? 0);
        const projected = used - (before?.sizeBytes ?? 0) + bytes.byteLength;
        if (projected > maxTotalBytesPerApp) return err(overByteCap);

        if (before !== undefined) {
          const updated = tx
            .update(appFiles)
            .set({
              contentType: ct,
              sizeBytes: bytes.byteLength,
              storage: "inline",
              blob: buf,
              checksum,
              updatedAt: now,
            })
            .where(atPath)
            .returning(metaColumns)
            .all();
          const row = updated[0];
          if (row === undefined) return err({ kind: "not_found" });
          return ok(rowToMeta(row));
        }

        const inserted = tx
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
          .returning(metaColumns)
          .all();
        const row = inserted[0];
        if (row === undefined) return err({ kind: "not_found" });
        return ok(rowToMeta(row));
      });
    },

    async get(appId, path) {
      if (!isValidFilePath(path))
        return err({ kind: "invalid_input", message: "invalid file path" });
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
      if (!isValidFilePath(path))
        return err({ kind: "invalid_input", message: "invalid file path" });
      const deleted = await db
        .delete(appFiles)
        .where(and(eq(appFiles.appId, appId), eq(appFiles.path, path)))
        .returning({ path: appFiles.path });
      const row = deleted[0];
      if (row === undefined) return err({ kind: "not_found" });
      return ok({ path: row.path });
    },
  };
};
