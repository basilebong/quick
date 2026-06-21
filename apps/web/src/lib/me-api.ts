import {
  type ConnectedAssistant,
  ConnectedAssistantsResponseSchema,
  type OAuthConsentId,
  RevokeAssistantResponseSchema,
} from "@quick/core/shared";
import * as v from "valibot";

const parseJson = async <T>(res: Response, schema: v.GenericSchema<unknown, T>): Promise<T> => {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  const raw: unknown = await res.json();
  return v.parse(schema, raw);
};

export const fetchAssistants = async (): Promise<ConnectedAssistant[]> => {
  const res = await fetch("/api/me/assistants", { credentials: "include" });
  const body = await parseJson(res, ConnectedAssistantsResponseSchema);
  return [...body.assistants];
};

export const revokeAssistant = async (id: OAuthConsentId): Promise<OAuthConsentId> => {
  const res = await fetch(`/api/me/assistants/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    credentials: "include",
  });
  const body = await parseJson(res, RevokeAssistantResponseSchema);
  return body.id;
};
