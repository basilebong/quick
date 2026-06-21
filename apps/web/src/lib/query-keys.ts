export const queryKeys = {
  me: ["me"] as const,
  apps: ["apps"] as const,
  app: (appId: string) => ["apps", appId] as const,
  deployments: (appId: string) => ["apps", appId, "deployments"] as const,
  links: (appId: string) => ["apps", appId, "links"] as const,
  accessLog: (appId: string) => ["apps", appId, "access-log"] as const,
  records: (appId: string) => ["apps", appId, "records"] as const,
  files: (appId: string) => ["apps", appId, "files"] as const,
  tokens: ["tokens"] as const,
};
