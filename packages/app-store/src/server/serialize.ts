import { parseAppRecordId } from "@quick/core/shared";
import type { AppRecord } from "../shared/index.ts";
import type { AppRecordRow } from "./schema.ts";

const parseData = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const rowToRecord = (row: AppRecordRow): AppRecord => ({
  id: parseAppRecordId(row.id),
  collection: row.collection,
  data: parseData(row.dataJson),
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});
