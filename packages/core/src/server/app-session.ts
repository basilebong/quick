import { createHmac, timingSafeEqual } from "node:crypto";
import * as v from "valibot";

// The per-app session cookie. HOST-ONLY (no Domain attribute) so the browser
// never sends app A's cookie to app B — this is what isolates `/_api/*` between
// apps (all `*.<rootDomain>` are the same SITE, so SameSite cannot isolate them;
// host-only scoping does). It is the ONLY credential `/_api/*` accepts. The
// value is a signed, self-contained capability — never a Better Auth session.
export const APP_SESSION_COOKIE = "quick_app_sess";
export const APP_SESSION_TTL_MS = 60 * 60 * 1000;

const ViewerSchema = v.variant("kind", [
  v.object({
    kind: v.literal("user"),
    userId: v.string(),
    email: v.string(),
    name: v.string(),
  }),
  v.object({ kind: v.literal("link"), linkId: v.string() }),
]);

const PayloadSchema = v.object({
  appId: v.string(),
  viewer: ViewerSchema,
  exp: v.number(),
});

export type AppSessionPayload = v.InferOutput<typeof PayloadSchema>;

const b64url = (buf: Buffer): string => buf.toString("base64url");

const signBody = (body: string, secret: string): string =>
  b64url(createHmac("sha256", secret).update(body).digest());

export const signAppSession = (payload: AppSessionPayload, secret: string): string => {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${signBody(body, secret)}`;
};

export const verifyAppSession = (
  token: string,
  secret: string,
  now: number,
): AppSessionPayload | null => {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const expected = signBody(body, secret);
  const provided = Buffer.from(token.slice(dot + 1));
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = v.safeParse(PayloadSchema, json);
  if (!parsed.success || parsed.output.exp <= now) return null;
  return parsed.output;
};
