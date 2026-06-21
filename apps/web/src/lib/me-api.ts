import * as v from "valibot";

const OwnerUserSchema = v.object({
  id: v.string(),
  email: v.string(),
  name: v.string(),
});
export type OwnerUser = v.InferOutput<typeof OwnerUserSchema>;

const MeResponseSchema = v.object({ user: OwnerUserSchema });

export type MeResult =
  | { kind: "owner"; user: OwnerUser }
  | { kind: "unauthorized" }
  | { kind: "forbidden" };

export const fetchMe = async (): Promise<MeResult> => {
  const res = await fetch("/api/me", { credentials: "include" });
  if (res.status === 401) return { kind: "unauthorized" };
  if (res.status === 403) return { kind: "forbidden" };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = v.parse(MeResponseSchema, await res.json());
  return { kind: "owner", user: body.user };
};
