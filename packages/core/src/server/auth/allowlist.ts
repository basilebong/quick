import * as v from "valibot";

const emailSchema = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email());

export const parseAllowedEmails = (raw: string | undefined): ReadonlySet<string> => {
  if (raw === undefined || raw.trim() === "") return new Set();
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => v.parse(emailSchema, s));
  return new Set(entries);
};

const normalize = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
};

export const isAllowedEmail = (allowed: ReadonlySet<string>, email: unknown): boolean => {
  const normalized = normalize(email);
  if (normalized === null) return false;
  return allowed.has(normalized);
};
