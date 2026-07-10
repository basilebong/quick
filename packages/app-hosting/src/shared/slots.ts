import type { HostingError } from "./errors.ts";

export const SLOT_MAX_BYTES = 5 * 1024 * 1024;
export const SLOT_MAX_PER_APP = 100;
export const SLOT_ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;

const SLOT_KEY_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const isValidSlotKey = (key: string): boolean => SLOT_KEY_REGEX.test(key);

const isAllowedMime = (mime: string): boolean => SLOT_ALLOWED_MIME.some((m) => m === mime);

export type SlotDefinition = {
  key: string;
  label?: string;
  accept?: string;
  maxBytes?: number;
};

export type SlotView = {
  key: string;
  label: string;
  acceptMime: string | null;
  maxBytes: number | null;
  active: boolean;
  filled: boolean;
  contentType: string | null;
  sizeBytes: number | null;
  updatedAt: number;
};

export const validateSlotDefinitions = (defs: readonly SlotDefinition[]): HostingError | null => {
  if (defs.length > SLOT_MAX_PER_APP) {
    return { kind: "invalid_input", message: `too many slots (max ${SLOT_MAX_PER_APP})` };
  }
  const seen = new Set<string>();
  for (const d of defs) {
    if (!isValidSlotKey(d.key)) {
      return { kind: "invalid_input", message: `invalid slot key: ${d.key}` };
    }
    if (seen.has(d.key)) {
      return { kind: "invalid_input", message: `duplicate slot key: ${d.key}` };
    }
    seen.add(d.key);
    if (d.accept !== undefined && !isAllowedMime(d.accept)) {
      return { kind: "invalid_input", message: `unsupported slot accept type: ${d.accept}` };
    }
    if (d.maxBytes !== undefined && (d.maxBytes <= 0 || d.maxBytes > SLOT_MAX_BYTES)) {
      return {
        kind: "invalid_input",
        message: `slot maxBytes must be between 1 and ${SLOT_MAX_BYTES}`,
      };
    }
  }
  return null;
};

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0): boolean => {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
};

const asciiSig = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));

// The stored/served content type is decided by the bytes, never the client's
// declared Content-Type — so a spoofed header can't smuggle a non-image (or a
// scriptable SVG) into a slot. Returns null for anything not on the allowlist.
export const sniffImageMime = (bytes: Uint8Array): string | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, asciiSig("GIF87a")) || startsWith(bytes, asciiSig("GIF89a"))) {
    return "image/gif";
  }
  if (startsWith(bytes, asciiSig("RIFF")) && startsWith(bytes, asciiSig("WEBP"), 8)) {
    return "image/webp";
  }
  if (
    startsWith(bytes, asciiSig("ftyp"), 4) &&
    (startsWith(bytes, asciiSig("avif"), 8) || startsWith(bytes, asciiSig("avis"), 8))
  ) {
    return "image/avif";
  }
  return null;
};
