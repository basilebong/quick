import type { AppRecordId } from "@quick/core/shared";

export type AppRecord = {
  id: AppRecordId;
  collection: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
};

// `truncated` tells the client more rows exist past the page it got: pass the last
// record's id back as the `before` cursor. Without it a caller that reads-all cannot
// tell a complete collection from a silently cut-off one.
export type RecordPage = {
  records: AppRecord[];
  truncated: boolean;
};
