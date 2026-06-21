import { Hono } from "hono";
import * as v from "valibot";
import { OAuthConsentIdSchema, parseUserId } from "../../shared/index.ts";
import type { AuditRecorder } from "../audit/recorder.ts";
import type { SessionVariables } from "../middleware/session.ts";
import type { AssistantError, AssistantsService } from "./service.ts";

export type AssistantsRoutesDeps = {
  service: AssistantsService;
  audit: AuditRecorder;
};

const statusFor = (e: AssistantError): 404 | 500 => (e.kind === "not_found" ? 404 : 500);

export const createAssistantsRoutes = ({ service, audit }: AssistantsRoutesDeps) =>
  new Hono<{ Variables: SessionVariables }>()
    .get("/", async (c) => {
      const userId = parseUserId(c.get("user").id);
      const result = await service.list(userId);
      if (result.kind === "err") return c.json(result.error, statusFor(result.error));
      return c.json({ assistants: result.value });
    })
    .post("/:id/revoke", async (c) => {
      const userId = parseUserId(c.get("user").id);
      const parsed = v.safeParse(OAuthConsentIdSchema, c.req.param("id"));
      if (!parsed.success) {
        return c.json({ kind: "not_found", message: "No such connected assistant" }, 404);
      }
      const result = await service.revoke(userId, parsed.output);
      if (result.kind === "err") return c.json(result.error, statusFor(result.error));
      await audit.record({
        userId,
        action: "assistant.revoke",
        via: "web",
        metadata: { clientId: result.value.clientId },
      });
      return c.json({ id: result.value.id });
    });
