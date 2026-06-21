import { describe, expect, test } from "bun:test";
import { type AppSessionPayload, signAppSession, verifyAppSession } from "./app-session.ts";

const secret = "test-secret-at-least-32-chars-long-xxxx";
const base: AppSessionPayload = {
  appId: "app_1",
  viewer: { kind: "user", userId: "u1", email: "a@b.co", name: "A" },
  exp: 0,
};

describe("app session capability", () => {
  test("round-trips a valid token", () => {
    const now = Date.now();
    const payload = { ...base, exp: now + 60_000 };
    expect(verifyAppSession(signAppSession(payload, secret), secret, now)).toEqual(payload);
  });

  test("round-trips a link viewer", () => {
    const now = Date.now();
    const payload: AppSessionPayload = {
      appId: "app_2",
      viewer: { kind: "link", linkId: "lnk_1" },
      exp: now + 1_000,
    };
    expect(verifyAppSession(signAppSession(payload, secret), secret, now)).toEqual(payload);
  });

  test("rejects a tampered body", () => {
    const token = signAppSession({ ...base, exp: Date.now() + 60_000 }, secret);
    expect(verifyAppSession(`x${token.slice(1)}`, secret, Date.now())).toBeNull();
  });

  test("rejects a wrong secret (cannot be forged)", () => {
    const token = signAppSession({ ...base, exp: Date.now() + 60_000 }, secret);
    expect(
      verifyAppSession(token, "another-secret-at-least-32-chars-xxxxx", Date.now()),
    ).toBeNull();
  });

  test("rejects an expired token", () => {
    const now = Date.now();
    const token = signAppSession({ ...base, exp: now - 1 }, secret);
    expect(verifyAppSession(token, secret, now)).toBeNull();
  });

  test("rejects malformed input", () => {
    expect(verifyAppSession("nodot", secret, Date.now())).toBeNull();
    expect(verifyAppSession("", secret, Date.now())).toBeNull();
  });
});
