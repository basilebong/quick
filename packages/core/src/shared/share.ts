export type ShareMode = "google" | "link";

// The viewer of a tenant app, as exposed to the static app via GET /_api/me.
export type Viewer =
  | { kind: "user"; userId: string; email: string; name: string }
  | { kind: "link"; linkId: string };
