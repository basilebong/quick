import { describe, expect, test } from "bun:test";
import {
  isValidSlotKey,
  SLOT_MAX_BYTES,
  SLOT_MAX_PER_APP,
  sniffImageMime,
  validateSlotDefinitions,
} from "./slots.ts";

const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = ascii("GIF89a\x00\x00\x00");
const WEBP = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), 0]);
const AVIF = new Uint8Array([0, 0, 0, 0x20, ...ascii("ftyp"), ...ascii("avif"), 0, 0]);

describe("isValidSlotKey", () => {
  test("accepts lowercase keys with . _ - and digits", () => {
    for (const k of ["hero", "og.image", "product-1", "a_b", "x".repeat(64)]) {
      expect(isValidSlotKey(k)).toBe(true);
    }
  });

  test("rejects uppercase, slashes, empty, leading punctuation, overlong", () => {
    for (const k of ["Hero", "a/b", "", "-hero", ".hero", "a".repeat(65), "hero/../etc"]) {
      expect(isValidSlotKey(k)).toBe(false);
    }
  });
});

describe("sniffImageMime", () => {
  test("recognizes each allowed raster format by signature", () => {
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(GIF)).toBe("image/gif");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
    expect(sniffImageMime(AVIF)).toBe("image/avif");
  });

  test("rejects SVG, text, and truncated/empty input", () => {
    expect(sniffImageMime(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageMime(ascii("hello, not an image"))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
});

describe("validateSlotDefinitions", () => {
  test("accepts an empty set and well-formed definitions", () => {
    expect(validateSlotDefinitions([])).toBeNull();
    expect(
      validateSlotDefinitions([
        { key: "hero", label: "Hero", accept: "image/png", maxBytes: 1000 },
        { key: "logo" },
      ]),
    ).toBeNull();
  });

  test("rejects an invalid or duplicate key", () => {
    expect(validateSlotDefinitions([{ key: "Bad Key" }])?.kind).toBe("invalid_input");
    expect(validateSlotDefinitions([{ key: "dup" }, { key: "dup" }])?.kind).toBe("invalid_input");
  });

  test("rejects an unsupported accept type", () => {
    expect(validateSlotDefinitions([{ key: "hero", accept: "image/svg+xml" }])?.kind).toBe(
      "invalid_input",
    );
  });

  test("rejects out-of-range maxBytes", () => {
    expect(validateSlotDefinitions([{ key: "hero", maxBytes: 0 }])?.kind).toBe("invalid_input");
    expect(validateSlotDefinitions([{ key: "hero", maxBytes: SLOT_MAX_BYTES + 1 }])?.kind).toBe(
      "invalid_input",
    );
  });

  test("rejects too many slots", () => {
    const defs = Array.from({ length: SLOT_MAX_PER_APP + 1 }, (_, i) => ({ key: `slot${i}` }));
    expect(validateSlotDefinitions(defs)?.kind).toBe("invalid_input");
  });
});
