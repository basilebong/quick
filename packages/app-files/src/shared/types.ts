import type { AppFileId } from "@quick/core/shared";

export type AppFileMeta = {
  id: AppFileId;
  path: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  createdAt: number;
  updatedAt: number;
};
