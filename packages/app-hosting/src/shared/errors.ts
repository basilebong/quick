import { match } from "ts-pattern";

export type HostingError =
  | { kind: "not_found" }
  | { kind: "invalid_input"; message: string }
  | { kind: "conflict"; message: string };

export const hostingErrorStatus = (e: HostingError): 400 | 404 | 409 =>
  match(e)
    .with({ kind: "not_found" }, () => 404 as const)
    .with({ kind: "invalid_input" }, () => 400 as const)
    .with({ kind: "conflict" }, () => 409 as const)
    .exhaustive();
