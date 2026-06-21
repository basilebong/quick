import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountStatic } from "./static.ts";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "quick-dist-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>quick</title>");
  writeFileSync(join(root, "assets", "app.js"), "globalThis.__quick = true;");
  writeFileSync(join(root, "manifest.webmanifest"), '{"name":"quick"}');
  writeFileSync(join(root, "sw.js"), "self.__WB_MANIFEST;");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("mountStatic", () => {
  test("GET / serves index.html", async () => {
    const app = mountStatic(root);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<title>quick</title>");
  });

  test("GET /assets/* serves the real asset with its own content-type", async () => {
    const app = mountStatic(root);
    const res = await app.request("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toBe("globalThis.__quick = true;");
  });

  test("GET a real top-level file serves it, not the SPA fallback", async () => {
    const app = mountStatic(root);
    const res = await app.request("/manifest.webmanifest");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"name":"quick"}');
  });

  test("GET /sw.js serves the service worker as JavaScript, not the SPA fallback", async () => {
    const app = mountStatic(root);
    const res = await app.request("/sw.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toBe("self.__WB_MANIFEST;");
  });

  test("GET an unknown client route falls back to index.html", async () => {
    const app = mountStatic(root);
    const res = await app.request("/recipes/abc123");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<title>quick</title>");
  });
});
