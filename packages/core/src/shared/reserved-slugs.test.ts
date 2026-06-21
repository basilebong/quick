import { describe, expect, test } from "bun:test";
import { isReservedSlug, isUsableSlug, isValidSlug } from "./reserved-slugs.ts";

describe("slug rules", () => {
  test("accepts valid DNS-label slugs", () => {
    for (const s of ["a", "acme", "my-app-1", "a1b2"]) expect(isValidSlug(s)).toBe(true);
  });

  test("rejects invalid slugs", () => {
    for (const s of ["", "-a", "a-", "A", "a_b", "a.b", "a".repeat(64)]) {
      expect(isValidSlug(s)).toBe(false);
    }
  });

  test("flags reserved labels case-insensitively", () => {
    expect(isReservedSlug("api")).toBe(true);
    expect(isReservedSlug("WWW")).toBe(true);
    expect(isReservedSlug("acme")).toBe(false);
  });

  test("usable = valid and not reserved", () => {
    expect(isUsableSlug("acme")).toBe(true);
    expect(isUsableSlug("api")).toBe(false);
    expect(isUsableSlug("-x")).toBe(false);
  });
});
