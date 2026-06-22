import { describe, expect, test } from "bun:test";
import { parseSubdomain } from "./host.ts";

describe("parseSubdomain", () => {
  const rd = "quick.example.com";

  test("apex host resolves to apex", () => {
    expect(parseSubdomain("quick.example.com", rd)).toEqual({ kind: "apex" });
    expect(parseSubdomain("quick.example.com:443", rd)).toEqual({ kind: "apex" });
  });

  test("single-label subdomain resolves to that app", () => {
    expect(parseSubdomain("acme.quick.example.com", rd)).toEqual({ kind: "app", label: "acme" });
    expect(parseSubdomain("acme.quick.example.com:5173", rd)).toEqual({
      kind: "app",
      label: "acme",
    });
  });

  test("multi-label or foreign hosts resolve to apex (never a wildcard app)", () => {
    expect(parseSubdomain("a.b.quick.example.com", rd)).toEqual({ kind: "apex" });
    expect(parseSubdomain("evil.com", rd)).toEqual({ kind: "apex" });
    expect(parseSubdomain("", rd)).toEqual({ kind: "apex" });
  });

  test("works for *.localhost in dev", () => {
    expect(parseSubdomain("acme.localhost", "localhost")).toEqual({ kind: "app", label: "acme" });
    expect(parseSubdomain("localhost", "localhost")).toEqual({ kind: "apex" });
  });

  test("strips everything from the first ':' — callers MUST NOT reflect the raw host", () => {
    expect(parseSubdomain("acme.quick.example.com:3000@evil.com", rd)).toEqual({
      kind: "app",
      label: "acme",
    });
    expect(parseSubdomain("acme.quick.example.com:@evil.com", rd)).toEqual({
      kind: "app",
      label: "acme",
    });
  });
});
