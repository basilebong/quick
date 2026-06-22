import { describe, expect, test } from "bun:test";
import { redactLogLine } from "./request-logger.ts";

describe("redactLogLine", () => {
  test("redacts a share-link token in the query string", () => {
    expect(redactLogLine("<-- GET /?t=SECRET_LINK_TOKEN")).toBe("<-- GET /?t=[redacted]");
  });

  test("redacts an sso code and preserves the status + timing tail", () => {
    expect(redactLogLine("--> GET /sso/callback?code=abc123&next=/x 302 1ms")).toBe(
      "--> GET /sso/callback?code=[redacted]&next=/x 302 1ms",
    );
  });

  test("redacts both `t` and `code` regardless of position", () => {
    expect(redactLogLine("<-- GET /a?x=1&t=AAA&code=BBB")).toBe(
      "<-- GET /a?x=1&t=[redacted]&code=[redacted]",
    );
  });

  test("leaves params that merely start with the same letters untouched", () => {
    expect(redactLogLine("<-- GET /dash?category=t&token=keepme")).toBe(
      "<-- GET /dash?category=t&token=keepme",
    );
  });
});
