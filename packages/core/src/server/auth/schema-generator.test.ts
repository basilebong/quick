import { describe, expect, test } from "bun:test";
import { type AuthTables, renderAuthSchema, toSnakeCase } from "./schema-generator.ts";

const tables = (fields: AuthTables[string]["fields"]): AuthTables => ({
  widget: { modelName: "widget", fields },
});

describe("renderAuthSchema", () => {
  test("renders an enum field as a constrained text column", () => {
    const code = renderAuthSchema(tables({ status: { type: ["on", "off"] } }), {});
    expect(code).toContain(`status: text("status", { enum: ["on","off"] }).notNull()`);
  });

  test("names composite extra indexes on the table", () => {
    const code = renderAuthSchema(tables({ a: { type: "string" }, bB: { type: "string" } }), {
      widget: [{ name: "widgets_a_b_unique", unique: true, fields: ["a", "bB"] }],
    });
    expect(code).toContain(`uniqueIndex("widgets_a_b_unique").on(table.a, table.bB)`);
    expect(code).toContain(`bB: text("b_b")`);
  });

  test("rejects an extra index on an unknown model", () => {
    expect(() =>
      renderAuthSchema(tables({}), { gadget: [{ name: "x", unique: false, fields: ["a"] }] }),
    ).toThrow(/unknown model "gadget"/);
  });

  test("rejects an extra index on an unknown field", () => {
    expect(() =>
      renderAuthSchema(tables({ a: { type: "string" } }), {
        widget: [{ name: "x", unique: false, fields: ["a", "missing"] }],
      }),
    ).toThrow(/unknown field widget\.missing/);
  });

  test("emits literal defaults and leaves function defaults to better-auth's adapter", () => {
    const code = renderAuthSchema(
      tables({
        on: { type: "boolean", defaultValue: false },
        at: { type: "date", defaultValue: () => new Date(), onUpdate: () => new Date() },
      }),
      {},
    );
    expect(code).toContain(`on: integer("on", { mode: "boolean" }).default(false).notNull()`);
    expect(code).toContain(
      `at: integer("at", { mode: "timestamp_ms" }).$onUpdate(() => new Date()).notNull()`,
    );
  });

  test.each([
    ["emailVerified", "email_verified"],
    ["requirePKCE", "require_pkce"],
    ["PKCEToken", "pkce_token"],
    ["oauthRefreshTokens", "oauth_refresh_tokens"],
    ["user2Id", "user2_id"],
  ])("snake-cases %s like better-auth does", (name, expected) => {
    expect(toSnakeCase(name)).toBe(expected);
  });
});
