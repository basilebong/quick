const PUBLIC_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
} as const;

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { headers: PUBLIC_HEADERS });

// Mirrors @better-auth/oauth-provider's published RFC 8414 metadata. Built by hand
// because oauthProviderAuthServerMetadata() requires the precisely-typed auth instance,
// whose inferred type is not portable across our composite project references.
// See https://github.com/better-auth/better-auth/issues/4250
export const createAuthServerMetadataHandler = (baseURL: string): (() => Response) => {
  const base = `${baseURL}/api/auth`;
  const metadata = {
    issuer: base,
    authorization_endpoint: `${base}/oauth2/authorize`,
    token_endpoint: `${base}/oauth2/token`,
    registration_endpoint: `${base}/oauth2/register`,
    userinfo_endpoint: `${base}/oauth2/userinfo`,
    introspection_endpoint: `${base}/oauth2/introspect`,
    revocation_endpoint: `${base}/oauth2/revoke`,
    end_session_endpoint: `${base}/oauth2/end-session`,
    jwks_uri: `${base}/jwks`,
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["EdDSA"],
    subject_types_supported: ["public"],
    authorization_response_iss_parameter_supported: true,
  };
  return () => json(metadata);
};

export const createProtectedResourceMetadataHandler =
  (resource: string, authorizationServer: string): (() => Response) =>
  () =>
    json({ resource, authorization_servers: [authorizationServer] });
