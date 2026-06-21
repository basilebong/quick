import { match } from "ts-pattern";

export type FilesError =
  | { kind: "not_found" }
  | { kind: "invalid_input"; message: string }
  | { kind: "too_large"; message: string };

export const filesErrorStatus = (e: FilesError): 400 | 404 | 413 =>
  match(e)
    .with({ kind: "not_found" }, () => 404 as const)
    .with({ kind: "invalid_input" }, () => 400 as const)
    .with({ kind: "too_large" }, () => 413 as const)
    .exhaustive();
