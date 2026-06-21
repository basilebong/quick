import type {
  AppId,
  AppSlug,
  DeploymentId,
  ShareLinkId,
  ShareMode,
  Viewer,
} from "../shared/index.ts";

// The resolved tenant app for a request to `<slug>.<rootDomain>`.
export type AppContext = {
  id: AppId;
  slug: AppSlug;
  name: string;
  shareMode: ShareMode;
  currentDeploymentId: DeploymentId | null;
};

export type Tenant = { kind: "apex" } | { kind: "app"; app: AppContext };

export type TenantVariables = { tenant: Tenant };
export type ViewerVariables = { viewer: Viewer };

// Implemented by @quick/app-hosting and injected at composition so core never
// imports an app package (keeps the boundary DAG acyclic).
export type AppRegistry = {
  findBySlug(slug: string): Promise<AppContext | null>;
};

export type AccessEvent = "view" | "denied";

export type AccessEntry = {
  appId: AppId;
  mode: ShareMode;
  viewer: Viewer | null;
  event: AccessEvent;
  path: string;
  ip: string | null;
  userAgent: string | null;
};

export type LinkValidation =
  | { kind: "valid"; linkId: ShareLinkId; expiresAt: number }
  | { kind: "expired" }
  | { kind: "invalid" };

export type ShareResolver = {
  validateLinkToken(appId: AppId, rawToken: string): Promise<LinkValidation>;
  recordAccess(entry: AccessEntry): Promise<void>;
};
