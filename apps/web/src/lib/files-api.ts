import type { AppFileMeta } from "@quick/app-files/shared";
import { AppFileIdSchema } from "@quick/core/shared";
import * as v from "valibot";

import { requestJson } from "@/lib/http";

const AppFileMetaSchema = v.object({
  id: AppFileIdSchema,
  path: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  checksum: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const FileListSchema = v.object({ files: v.array(AppFileMetaSchema) });
const DeleteFileSchema = v.object({ path: v.string() });

const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

export const deleteFile = async (appId: string, path: string): Promise<string> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/files/${encodePath(path)}`,
    DeleteFileSchema,
    { method: "DELETE" },
  );
  return body.path;
};

export const fetchFiles = async (appId: string): Promise<AppFileMeta[]> => {
  const body = await requestJson(`/api/apps/${encodeURIComponent(appId)}/files`, FileListSchema);
  return [...body.files];
};
