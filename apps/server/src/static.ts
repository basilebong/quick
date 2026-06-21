import { Hono } from "hono";
import { serveStatic } from "hono/bun";

export const mountStatic = (root: string) =>
  new Hono().use("/*", serveStatic({ root })).get("/*", serveStatic({ root, path: "index.html" }));
