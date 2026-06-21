import {
  type CreateItemInput,
  type GroceryItem,
  type GroceryItemId,
  GroceryItemIdSchema,
  type UpdateItemInput,
} from "@quick/app-grocery/shared";
import { UserIdSchema } from "@quick/core/shared";
import * as v from "valibot";

const ItemSchema = v.object({
  id: GroceryItemIdSchema,
  name: v.string(),
  description: v.nullable(v.string()),
  status: v.union([
    v.object({ kind: v.literal("pending") }),
    v.object({
      kind: v.literal("purchased"),
      purchasedAt: v.number(),
      purchasedBy: UserIdSchema,
    }),
  ]),
  createdAt: v.number(),
  updatedAt: v.number(),
  addedBy: v.union([
    v.object({
      kind: v.literal("user"),
      id: UserIdSchema,
      name: v.string(),
      initial: v.string(),
    }),
    v.object({
      kind: v.literal("unknown"),
      name: v.string(),
      initial: v.string(),
    }),
  ]),
});

const ItemListResponseSchema = v.object({ items: v.array(ItemSchema) });
const ItemEnvelopeSchema = v.object({ item: ItemSchema });
const DeleteResponseSchema = v.object({ id: GroceryItemIdSchema });

const parseJson = async <T>(res: Response, schema: v.GenericSchema<unknown, T>): Promise<T> => {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  const raw: unknown = await res.json();
  return v.parse(schema, raw);
};

export const fetchItems = async (): Promise<GroceryItem[]> => {
  const res = await fetch("/api/grocery/items", { credentials: "include" });
  const body = await parseJson(res, ItemListResponseSchema);
  return [...body.items];
};

export const createItem = async (
  input: CreateItemInput,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<GroceryItem> => {
  const res = await fetch("/api/grocery/items", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
  const body = await parseJson(res, ItemEnvelopeSchema);
  return body.item;
};

export const togglePurchased = async (
  id: GroceryItemId,
  purchased: boolean,
): Promise<GroceryItem> => {
  const res = await fetch(`/api/grocery/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purchased }),
  });
  const body = await parseJson(res, ItemEnvelopeSchema);
  return body.item;
};

export const updateItem = async (
  id: GroceryItemId,
  input: UpdateItemInput,
): Promise<GroceryItem> => {
  const res = await fetch(`/api/grocery/items/${encodeURIComponent(id)}/content`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseJson(res, ItemEnvelopeSchema);
  return body.item;
};

export const deleteItem = async (id: GroceryItemId): Promise<void> => {
  const res = await fetch(`/api/grocery/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.status === 404) return;
  const body = await parseJson(res, DeleteResponseSchema);
  if (body.id !== id) throw new Error("delete: id mismatch");
};
