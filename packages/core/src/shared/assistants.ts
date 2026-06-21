import * as v from "valibot";
import { OAuthConsentIdSchema } from "./ids.ts";

export const ConnectedAssistantSchema = v.object({
  id: OAuthConsentIdSchema,
  clientId: v.string(),
  name: v.string(),
  connectedAt: v.number(),
});
export type ConnectedAssistant = v.InferOutput<typeof ConnectedAssistantSchema>;

export const ConnectedAssistantsResponseSchema = v.object({
  assistants: v.array(ConnectedAssistantSchema),
});
export type ConnectedAssistantsResponse = v.InferOutput<typeof ConnectedAssistantsResponseSchema>;

export const RevokeAssistantResponseSchema = v.object({ id: OAuthConsentIdSchema });
