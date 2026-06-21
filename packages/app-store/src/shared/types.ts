import type { AppRecordId } from "@quick/core/shared";

export type AppRecord = {
  id: AppRecordId;
  collection: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
};
