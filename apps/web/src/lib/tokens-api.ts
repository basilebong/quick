import type { AccessTokenView } from "@quick/app-hosting/shared";
import * as v from "valibot";

import { jsonBody, requestJson } from "@/lib/http";

const AccessTokenViewSchema = v.object({
  id: v.string(),
  label: v.string(),
  createdAt: v.number(),
  lastUsedAt: v.nullable(v.number()),
  revokedAt: v.nullable(v.number()),
});

const TokenListSchema = v.object({ tokens: v.array(AccessTokenViewSchema) });
const CreateTokenSchema = v.object({ token: v.string(), view: AccessTokenViewSchema });
const DeleteTokenSchema = v.object({ id: v.string() });

export type CreatedToken = {
  token: string;
  view: AccessTokenView;
};

export const createToken = async (label: string): Promise<CreatedToken> => {
  const body = await requestJson("/api/tokens", CreateTokenSchema, jsonBody({ label }));
  return { token: body.token, view: body.view };
};

export const fetchTokens = async (): Promise<AccessTokenView[]> => {
  const body = await requestJson("/api/tokens", TokenListSchema);
  return [...body.tokens];
};

export const revokeToken = async (tokenId: string): Promise<string> => {
  const body = await requestJson(`/api/tokens/${encodeURIComponent(tokenId)}`, DeleteTokenSchema, {
    method: "DELETE",
  });
  return body.id;
};
