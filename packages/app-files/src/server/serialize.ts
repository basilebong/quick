import { parseAppFileId } from "@quick/core/shared";
import type { AppFileMeta } from "../shared/index.ts";
import type { AppFileRow } from "./schema.ts";

export const rowToMeta = (row: AppFileRow): AppFileMeta => ({
  id: parseAppFileId(row.id),
  path: row.path,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  checksum: row.checksum,
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});
