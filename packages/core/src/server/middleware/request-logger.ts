import { logger } from "hono/logger";

// `?t=` (share-link tokens) and `?code=` (one-time SSO handoff codes) are live
// credentials. hono/logger logs the full path INCLUDING the query string, so the
// default logger would write them to stdout before the share gate strips them.
// Redact those values from every log line. See .claude/rules/security.md.
const SENSITIVE_QUERY_PARAMS = ["t", "code"] as const;
const SENSITIVE_QUERY_RE = new RegExp(
  `([?&](?:${SENSITIVE_QUERY_PARAMS.join("|")})=)[^&\\s]+`,
  "g",
);

export const redactLogLine = (line: string): string =>
  line.replace(SENSITIVE_QUERY_RE, "$1[redacted]");

export const createRequestLogger = () =>
  logger((message: string, ...rest: string[]) => console.log(redactLogLine(message), ...rest));
