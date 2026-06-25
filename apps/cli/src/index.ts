#!/usr/bin/env bun
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { ShareModeSchema } from "@quick/app-hosting/shared";
import { isUsableSlug } from "@quick/core/shared";
import * as v from "valibot";

const CONFIG_PATH = join(homedir(), ".quick", "config.json");

const ConfigSchema = v.object({
  baseURL: v.pipe(v.string(), v.url()),
  token: v.pipe(v.string(), v.minLength(1)),
});
type Config = v.InferOutput<typeof ConfigSchema>;

const QuickJsonSchema = v.object({
  slug: v.pipe(v.string(), v.check(isUsableSlug, "invalid or reserved slug")),
  shareMode: ShareModeSchema,
});

const AppSchema = v.object({
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  shareMode: v.string(),
  currentDeploymentId: v.nullable(v.string()),
});
const AppsResponse = v.object({ apps: v.array(AppSchema) });
const AppResponse = v.object({ app: AppSchema });

const DeploymentSchema = v.object({
  id: v.string(),
  version: v.number(),
  status: v.string(),
  fileCount: v.number(),
  totalBytes: v.number(),
  createdAt: v.number(),
});
const DeploymentsResponse = v.object({ deployments: v.array(DeploymentSchema) });
const DeploymentResponse = v.object({ deployment: DeploymentSchema });

const LinkSchema = v.object({
  id: v.string(),
  label: v.string(),
  expiresAt: v.number(),
  revokedAt: v.nullable(v.number()),
  active: v.boolean(),
  expired: v.boolean(),
});
const CreateLinkResponse = v.object({ link: LinkSchema, token: v.string() });

const AccessLogResponse = v.object({
  entries: v.array(
    v.object({
      event: v.string(),
      mode: v.string(),
      path: v.string(),
      userId: v.nullable(v.string()),
      linkId: v.nullable(v.string()),
      createdAt: v.number(),
    }),
  ),
});

const fail = (message: string): never => {
  console.error(`quick: ${message}`);
  process.exit(1);
};

const readConfig = (): Config => {
  if (!existsSync(CONFIG_PATH)) {
    return fail("not logged in — run `quick login --url <apex-url> --token <pat>`");
  }
  return v.parse(ConfigSchema, JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
};

const writeConfig = (config: Config): void => {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // writeFileSync's mode is ignored when the file already exists; chmod
  // guarantees 0600 on overwrite so an older world-readable token is tightened.
  chmodSync(CONFIG_PATH, 0o600);
};

type Args = { positional: string[]; flags: Map<string, string> };

const parseArgs = (argv: string[]): Args => {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? "";
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(a.slice(2), next);
        i += 1;
      } else {
        flags.set(a.slice(2), "true");
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
};

const request = async (
  config: Config,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> => {
  const headers: Record<string, string> = { authorization: `Bearer ${config.token}` };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(new URL(path, config.baseURL), init);
  const text = await res.text();
  if (!res.ok) return fail(`${method} ${path} → ${res.status}: ${text}`);
  return text === "" ? null : JSON.parse(text);
};

const get = async <S extends v.GenericSchema>(
  config: Config,
  path: string,
  schema: S,
): Promise<v.InferOutput<S>> => v.parse(schema, await request(config, "GET", path));

const appBaseUrl = (config: Config, slug: string): string => {
  const u = new URL(config.baseURL);
  return `${u.protocol}//${slug}.${u.host}`;
};

const readQuickJson = (): v.InferOutput<typeof QuickJsonSchema> => {
  if (!existsSync("quick.json")) {
    return fail("no quick.json here — run `quick init --slug <slug> --mode <google|link>`");
  }
  return v.parse(QuickJsonSchema, JSON.parse(readFileSync("quick.json", "utf8")));
};

type App = v.InferOutput<typeof AppSchema>;

const requireApp = async (config: Config, slug: string): Promise<App> => {
  const { apps } = await get(config, "/api/apps", AppsResponse);
  const app = apps.find((a) => a.slug === slug);
  return app === undefined ? fail(`no app "${slug}"`) : app;
};

const collectFiles = (dir: string): { path: string; content: string }[] => {
  const out: { path: string; content: string }[] = [];
  const walk = (cur: string): void => {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = join(cur, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = relative(dir, full).split(sep).join("/");
      if (rel === "quick.json") continue;
      out.push({ path: rel, content: readFileSync(full).toString("base64") });
    }
  };
  walk(dir);
  return out;
};

const ensureApp = async (config: Config, slug: string, shareMode: string): Promise<string> => {
  const { apps } = await get(config, "/api/apps", AppsResponse);
  const existing = apps.find((a) => a.slug === slug);
  if (existing !== undefined) return existing.id;
  const created = v.parse(
    AppResponse,
    await request(config, "POST", "/api/apps", { slug, name: slug, shareMode }),
  );
  return created.app.id;
};

const cmdLogin = (args: Args): void => {
  const baseURL = args.flags.get("url");
  const token = args.flags.get("token");
  if (baseURL === undefined || token === undefined) {
    return void fail("usage: quick login --url <apex-url> --token <pat>");
  }
  writeConfig(v.parse(ConfigSchema, { baseURL, token }));
  console.log(`Saved credentials for ${baseURL} to ${CONFIG_PATH}`);
};

const cmdInit = (args: Args): void => {
  const slug = args.flags.get("slug");
  if (slug === undefined) return void fail("usage: quick init --slug <slug> [--mode google|link]");
  const config = v.parse(QuickJsonSchema, { slug, shareMode: args.flags.get("mode") ?? "google" });
  writeFileSync("quick.json", `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote quick.json (slug=${config.slug}, mode=${config.shareMode})`);
};

const cmdDeploy = async (config: Config, args: Args): Promise<void> => {
  const dir = args.positional[0] ?? ".";
  const manifest = readQuickJson();
  const files = collectFiles(dir);
  if (files.length === 0) return void fail(`no files found in ${dir}`);
  if (!files.some((f) => f.path === "index.html")) return void fail("deployment needs index.html");
  const appId = await ensureApp(config, manifest.slug, manifest.shareMode);
  const { deployment } = v.parse(
    DeploymentResponse,
    await request(config, "POST", `/api/apps/${appId}/deployments`, { files }),
  );
  console.log(`Deployed v${deployment.version} (${deployment.fileCount} files)`);
  console.log(`  ${appBaseUrl(config, manifest.slug)}`);
};

const cmdList = async (config: Config): Promise<void> => {
  const { apps } = await get(config, "/api/apps", AppsResponse);
  if (apps.length === 0) {
    console.log("No apps yet.");
    return;
  }
  for (const a of apps) {
    const state = a.currentDeploymentId === null ? "—" : "live";
    console.log(`${a.slug.padEnd(24)} ${a.shareMode.padEnd(7)} ${state}  ${a.name}`);
  }
};

const cmdDeployments = async (config: Config, slug: string): Promise<void> => {
  const app = await requireApp(config, slug);
  const { deployments } = await get(config, `/api/apps/${app.id}/deployments`, DeploymentsResponse);
  for (const d of deployments) {
    const current = app.currentDeploymentId === d.id ? " (current)" : "";
    console.log(`v${d.version}\t${d.fileCount} files\t${d.status}${current}`);
  }
};

const cmdRollback = async (config: Config, slug: string, version: string): Promise<void> => {
  const app = await requireApp(config, slug);
  const { deployments } = await get(config, `/api/apps/${app.id}/deployments`, DeploymentsResponse);
  const target = deployments.find((d) => String(d.version) === version);
  if (target === undefined) return void fail(`no version ${version} for "${slug}"`);
  await request(config, "POST", `/api/apps/${app.id}/deployments/${target.id}/activate`);
  console.log(`Activated v${version} of ${slug}`);
};

const cmdDelete = async (config: Config, slug: string): Promise<void> => {
  const app = await requireApp(config, slug);
  await request(config, "DELETE", `/api/apps/${app.id}`);
  console.log(`Deleted ${slug}`);
};

const cmdLinkCreate = async (config: Config, slug: string, args: Args): Promise<void> => {
  const app = await requireApp(config, slug);
  const expires = args.flags.get("expires");
  if (expires === undefined) {
    return void fail("usage: quick link create <slug> --expires <ISO-8601> [--label <text>]");
  }
  const expiresAt = Date.parse(expires);
  if (Number.isNaN(expiresAt)) return void fail(`invalid --expires date: ${expires}`);
  const { link, token } = v.parse(
    CreateLinkResponse,
    await request(config, "POST", `/api/apps/${app.id}/links`, {
      label: args.flags.get("label") ?? "",
      expiresAt,
    }),
  );
  console.log(`Created link ${link.id} (expires ${new Date(link.expiresAt).toISOString()}):`);
  console.log(`  ${appBaseUrl(config, slug)}/?t=${token}`);
};

const cmdLinkRevoke = async (config: Config, slug: string, linkId: string): Promise<void> => {
  const app = await requireApp(config, slug);
  await request(config, "DELETE", `/api/apps/${app.id}/links/${linkId}`);
  console.log(`Revoked link ${linkId}`);
};

const cmdLogs = async (config: Config, slug: string): Promise<void> => {
  const app = await requireApp(config, slug);
  const { entries } = await get(config, `/api/apps/${app.id}/access-log`, AccessLogResponse);
  for (const e of entries) {
    const who = e.userId ?? e.linkId ?? "—";
    console.log(`${new Date(e.createdAt).toISOString()}\t${e.event}\t${e.mode}\t${who}\t${e.path}`);
  }
};

const HELP = `quick — deploy static apps to your Quick instance

Usage:
  quick login --url <apex-url> --token <pat>
  quick init --slug <slug> [--mode google|link]
  quick deploy [dir]
  quick list
  quick deployments <slug>
  quick rollback <slug> <version>
  quick delete <slug>
  quick link create <slug> --expires <ISO-8601> [--label <text>]
  quick link revoke <slug> <linkId>
  quick logs <slug>
`;

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (command === undefined || command === "help" || command === "--help") {
    console.log(HELP);
    return;
  }
  if (command === "login") return cmdLogin(args);
  if (command === "init") return cmdInit(args);

  const config = readConfig();
  const a = args.positional[0];
  const b = args.positional[1];

  switch (command) {
    case "deploy":
      return cmdDeploy(config, args);
    case "list":
      return cmdList(config);
    case "deployments":
      return a === undefined
        ? void fail("usage: quick deployments <slug>")
        : cmdDeployments(config, a);
    case "rollback":
      return a === undefined || b === undefined
        ? void fail("usage: quick rollback <slug> <version>")
        : cmdRollback(config, a, b);
    case "delete":
      return a === undefined ? void fail("usage: quick delete <slug>") : cmdDelete(config, a);
    case "logs":
      return a === undefined ? void fail("usage: quick logs <slug>") : cmdLogs(config, a);
    case "link": {
      if (a === "create" && b !== undefined) return cmdLinkCreate(config, b, args);
      if (a === "revoke" && b !== undefined && args.positional[2] !== undefined) {
        return cmdLinkRevoke(config, b, args.positional[2]);
      }
      return void fail("usage: quick link create|revoke <slug> ...");
    }
    default:
      return void fail(`unknown command "${command}" (try \`quick help\`)`);
  }
};

await main();
