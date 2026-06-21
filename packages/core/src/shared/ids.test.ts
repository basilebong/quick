import { describe, expect, test } from "bun:test";
import { parseUserId } from "./ids.ts";

describe("parseUserId", () => {
  test("accepts a non-empty string", () => {
    const id = parseUserId("user_01HXYZ");
    expect(id).toBe(parseUserId("user_01HXYZ"));
  });

  test("rejects empty string", () => {
    expect(() => parseUserId("")).toThrow();
  });

  test("rejects non-string", () => {
    expect(() => parseUserId(123)).toThrow();
    expect(() => parseUserId(null)).toThrow();
    expect(() => parseUserId(undefined)).toThrow();
  });
});
