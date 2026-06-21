import { describe, expect, test } from "bun:test";
import { isAllowedEmail, parseAllowedEmails } from "./allowlist.ts";

describe("parseAllowedEmails", () => {
  test("returns empty set for undefined", () => {
    expect(parseAllowedEmails(undefined).size).toBe(0);
  });

  test("returns empty set for empty string", () => {
    expect(parseAllowedEmails("").size).toBe(0);
  });

  test("splits comma-separated emails", () => {
    const set = parseAllowedEmails("a@example.com,b@example.com");
    expect(set.size).toBe(2);
    expect(set.has("a@example.com")).toBe(true);
    expect(set.has("b@example.com")).toBe(true);
  });

  test("trims whitespace around entries", () => {
    const set = parseAllowedEmails("  a@example.com ,\tb@example.com\n");
    expect(set.has("a@example.com")).toBe(true);
    expect(set.has("b@example.com")).toBe(true);
  });

  test("lowercases entries", () => {
    const set = parseAllowedEmails("Basile@Example.COM");
    expect(set.has("basile@example.com")).toBe(true);
  });

  test("ignores empty segments from stray commas", () => {
    const set = parseAllowedEmails(",a@example.com,,b@example.com,");
    expect(set.size).toBe(2);
  });

  test("rejects entries that lack '@'", () => {
    expect(() => parseAllowedEmails("not-an-email")).toThrow();
  });
});

describe("isAllowedEmail", () => {
  const allowed = parseAllowedEmails("basile@example.com,partner@example.com");

  test("matches case-insensitively", () => {
    expect(isAllowedEmail(allowed, "Basile@Example.com")).toBe(true);
    expect(isAllowedEmail(allowed, "BASILE@EXAMPLE.COM")).toBe(true);
  });

  test("trims surrounding whitespace before matching", () => {
    expect(isAllowedEmail(allowed, "  basile@example.com  ")).toBe(true);
  });

  test("rejects emails not in the set", () => {
    expect(isAllowedEmail(allowed, "stranger@example.com")).toBe(false);
  });

  test("rejects empty / nullish inputs", () => {
    expect(isAllowedEmail(allowed, "")).toBe(false);
    expect(isAllowedEmail(allowed, null)).toBe(false);
    expect(isAllowedEmail(allowed, undefined)).toBe(false);
  });

  test("rejects non-string inputs", () => {
    expect(isAllowedEmail(allowed, 42)).toBe(false);
    expect(isAllowedEmail(allowed, { email: "basile@example.com" })).toBe(false);
  });

  test("empty allowlist denies everyone", () => {
    const empty = parseAllowedEmails(undefined);
    expect(isAllowedEmail(empty, "basile@example.com")).toBe(false);
  });
});
