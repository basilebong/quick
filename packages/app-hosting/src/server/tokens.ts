import { createHash, randomBytes } from "node:crypto";

// Share-link tokens and personal access tokens are high-entropy random strings,
// stored only as SHA-256 hashes. Plaintext is shown to the owner once and never
// persisted or logged.
export const PAT_PREFIX = "quick_pat_";

export const generateLinkToken = (): string => randomBytes(32).toString("base64url");

export const generatePat = (): string => `${PAT_PREFIX}${randomBytes(32).toString("base64url")}`;

export const hashToken = (raw: string): string =>
  createHash("sha256").update(raw).digest("base64url");
