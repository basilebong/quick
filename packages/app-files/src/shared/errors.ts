import { match } from "ts-pattern";

export type FilesError =
  | { kind: "not_found" }
  | { kind: "invalid_input"; message: string }
  | { kind: "too_large"; message: string }
  | { kind: "quota_exceeded"; message: string };

export const filesErrorStatus = (e: FilesError): 400 | 404 | 413 | 507 =>
  match(e)
    .with({ kind: "not_found" }, () => 404 as const)
    .with({ kind: "invalid_input" }, () => 400 as const)
    .with({ kind: "too_large" }, () => 413 as const)
    .with({ kind: "quota_exceeded" }, () => 507 as const)
    .exhaustive();
