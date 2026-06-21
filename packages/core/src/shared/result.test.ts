import { describe, expect, test } from "bun:test";
import { err, isErr, isOk, ok } from "./result.ts";

describe("Result", () => {
  test("ok constructs an ok variant", () => {
    const r = ok(42);
    expect(r.kind).toBe("ok");
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  test("err constructs an err variant", () => {
    const r = err("bad");
    expect(r.kind).toBe("err");
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) expect(r.error).toBe("bad");
  });
});
