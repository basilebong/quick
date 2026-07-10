import type { SlotView } from "@quick/app-hosting/shared";
import * as v from "valibot";

import { parseJson, requestJson } from "@/lib/http";

const SlotViewSchema = v.object({
  key: v.string(),
  label: v.string(),
  acceptMime: v.nullable(v.string()),
  maxBytes: v.nullable(v.number()),
  active: v.boolean(),
  filled: v.boolean(),
  contentType: v.nullable(v.string()),
  sizeBytes: v.nullable(v.number()),
  updatedAt: v.number(),
});

const SlotListSchema = v.object({ slots: v.array(SlotViewSchema) });
const FillSchema = v.object({ slot: SlotViewSchema });
const ClearSchema = v.object({ key: v.string() });

export const fetchSlots = async (appId: string): Promise<SlotView[]> => {
  const body = await requestJson(`/api/apps/${encodeURIComponent(appId)}/slots`, SlotListSchema);
  return [...body.slots];
};

export const fillSlot = async (appId: string, key: string, file: File): Promise<SlotView> => {
  const res = await fetch(
    `/api/apps/${encodeURIComponent(appId)}/slots/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": file.type === "" ? "application/octet-stream" : file.type },
      body: file,
    },
  );
  const body = await parseJson(res, FillSchema);
  return body.slot;
};

export const clearSlot = async (appId: string, key: string): Promise<string> => {
  const body = await requestJson(
    `/api/apps/${encodeURIComponent(appId)}/slots/${encodeURIComponent(key)}`,
    ClearSchema,
    { method: "DELETE" },
  );
  return body.key;
};
