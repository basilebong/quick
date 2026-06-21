import type { AppRecord } from "@quick/app-store/shared";
import { AppRecordIdSchema } from "@quick/core/shared";
import * as v from "valibot";

import { requestJson } from "@/lib/http";

const AppRecordSchema = v.object({
  id: AppRecordIdSchema,
  collection: v.string(),
  data: v.unknown(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const RecordListSchema = v.object({ records: v.array(AppRecordSchema) });
const DeleteRecordSchema = v.object({ id: AppRecordIdSchema });

export const deleteRecord = async (
  appId: string,
  collection: string,
  id: string,
): Promise<string> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/records/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    DeleteRecordSchema,
    { method: "DELETE" },
  );
  return body.id;
};

export const fetchRecords = async (appId: string): Promise<AppRecord[]> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/records`,
    RecordListSchema,
  );
  return [...body.records];
};
