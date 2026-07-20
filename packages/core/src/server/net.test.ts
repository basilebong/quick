import { describe, expect, test } from "bun:test";
import { clientIpFromXff } from "./net.ts";

describe("clientIpFromXff", () => {
  test("returns null when the header is absent or empty", () => {
    expect(clientIpFromXff(undefined)).toBeNull();
    expect(clientIpFromXff("")).toBeNull();
    expect(clientIpFromXff("  ")).toBeNull();
  });

  test("a single entry is returned as-is", () => {
    expect(clientIpFromXff("1.2.3.4")).toBe("1.2.3.4");
  });

  test("takes the LAST entry — the one our own proxy appended — not the spoofable first", () => {
    expect(clientIpFromXff("9.9.9.9, 1.2.3.4")).toBe("1.2.3.4");
    expect(clientIpFromXff("evil, spoof, 203.0.113.7")).toBe("203.0.113.7");
  });

  test("trims whitespace and skips trailing empty segments", () => {
    expect(clientIpFromXff("9.9.9.9,  1.2.3.4 ")).toBe("1.2.3.4");
    expect(clientIpFromXff("1.2.3.4, ")).toBe("1.2.3.4");
  });
});
