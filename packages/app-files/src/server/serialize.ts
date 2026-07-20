import { parseAppFileId } from "@quick/core/shared";
import type { AppFileMeta } from "../shared/index.ts";
import { appFiles } from "./schema.ts";
import type { AppFileRow } from "./schema.ts";

// Every column `rowToMeta` reads, and none of the ones it doesn't — notably not the
// inline `blob`. Selecting the whole row to describe a file reads every byte of it off
// disk and materializes it as a Buffer only to throw it away, which at the per-app byte
// cap is a ~100 MiB allocation to answer a metadata request. Keep it beside rowToMeta:
// the two must name the same fields.
export const metaColumns = {
  id: appFiles.id,
  path: appFiles.path,
  contentType: appFiles.contentType,
  sizeBytes: appFiles.sizeBytes,
  checksum: appFiles.checksum,
  createdAt: appFiles.createdAt,
  updatedAt: appFiles.updatedAt,
};

type AppFileMetaRow = Pick<
  AppFileRow,
  "id" | "path" | "contentType" | "sizeBytes" | "checksum" | "createdAt" | "updatedAt"
>;

export const rowToMeta = (row: AppFileMetaRow): AppFileMeta => ({
  id: parseAppFileId(row.id),
  path: row.path,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  checksum: row.checksum,
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});
