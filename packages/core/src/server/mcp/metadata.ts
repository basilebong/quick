export type AuthHandler = (req: Request) => Promise<Response>;

const withPublicCors = (res: Response): Response => {
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", "*");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

// MCP clients probe discovery at the root of the origin, while Better Auth publishes the
// RFC 8414 / OIDC documents under its /api/auth base path. Re-serving Better Auth's own
// documents keeps the root ones from drifting from what the provider actually supports.
export const createDiscoveryHandler =
  (authHandler: AuthHandler, baseURL: string) =>
  (authPath: string) =>
  async (): Promise<Response> =>
    withPublicCors(await authHandler(new Request(`${baseURL}${authPath}`)));
