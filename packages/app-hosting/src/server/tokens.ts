import { createHash, randomBytes } from "node:crypto";

// Share-link tokens are high-entropy random strings, stored only as SHA-256
// hashes. Plaintext is shown to the owner once and never persisted or logged.
const randomToken = (): string => randomBytes(32).toString("base64url");

export const generateLinkToken = (): string => randomToken();

// The handoff code (apex → tenant, single-use) and the per-app session token
// (host-only `quick_app_sess`). Both are opaque ≥256-bit randoms stored only as
// SHA-256 hashes, like link tokens and PATs.
export const generateSsoCode = (): string => randomToken();

export const generateAppSessionToken = (): string => randomToken();

export const hashToken = (raw: string): string =>
  createHash("sha256").update(raw).digest("base64url");
