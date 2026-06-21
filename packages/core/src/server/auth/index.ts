import { oauthProvider } from "@better-auth/oauth-provider";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import type { Db } from "../db/index.ts";
import * as authSchema from "./schema.ts";

export type CreateAuthOptions = {
  db: Db;
  baseURL: string;
  secret: string;
  google: { clientId: string; clientSecret: string };
  // Owner gating is intentionally NOT enforced at sign-up: any Google account may
  // sign in (that is the "google" share mode — anyone with the link who signs in
  // with Google may view). Owner-only surfaces (dashboard, deploy API, MCP tools)
  // are gated per-request by `requireOwner` against the owner allowlist instead.
  allowedEmails: ReadonlySet<string>;
  useSecureCookies: boolean;
  mcpResource: string;
};

export const createAuth = (opts: CreateAuthOptions) => {
  const plugins: BetterAuthPlugin[] = [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      validAudiences: [opts.mcpResource],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      requirePKCE: true,
      accessTokenExpiresIn: 60 * 15,
      silenceWarnings: { oauthAuthServerConfig: true },
    }),
  ];

  return betterAuth({
    appName: "Quick",
    baseURL: opts.baseURL,
    secret: opts.secret,

    // Apex only. Tenant subdomains serve untrusted code and are same-site, so they
    // must NOT be trusted origins (that would defeat Better Auth's CSRF check on
    // /api/auth/*). The google handoff returns through an apex-path callbackURL.
    trustedOrigins: [opts.baseURL],

    database: drizzleAdapter(opts.db, {
      provider: "sqlite",
      usePlural: true,
      schema: authSchema,
    }),

    socialProviders: {
      google: {
        clientId: opts.google.clientId,
        clientSecret: opts.google.clientSecret,
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },

    advanced: {
      cookiePrefix: "Quick",
      useSecureCookies: opts.useSecureCookies,
      // HOST-ONLY: no crossSubDomainCookies. The apex session cookie must never
      // carry a Domain attribute, so it is never sent to a tenant subdomain. Cross-
      // subdomain google access goes through the apex one-time-code handoff
      // (/sso/grant -> /sso/callback), which sets a host-only quick_app_sess.
    },

    plugins,
  });
};

export type Auth = ReturnType<typeof createAuth>;
