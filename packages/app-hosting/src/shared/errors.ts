import { match } from "ts-pattern";

export type HostingError =
  | { kind: "not_found" }
  | { kind: "invalid_input"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "too_large"; message: string }
  | { kind: "unsupported_media_type"; message: string };

export const hostingErrorStatus = (e: HostingError): 400 | 404 | 409 | 413 | 415 =>
  match(e)
    .with({ kind: "not_found" }, () => 404 as const)
    .with({ kind: "invalid_input" }, () => 400 as const)
    .with({ kind: "conflict" }, () => 409 as const)
    .with({ kind: "too_large" }, () => 413 as const)
    .with({ kind: "unsupported_media_type" }, () => 415 as const)
    .exhaustive();
