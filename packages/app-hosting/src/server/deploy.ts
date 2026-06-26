import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { HostingError } from "../shared/index.ts";

export type DeployFile = { path: string; bytes: Uint8Array };

export const DEPLOY_MAX_FILES = 2000;
// Deploys flow through an MCP tool call (the model's context), not bulk upload,
// so this is sized for text apps, not archives.
export const DEPLOY_MAX_TOTAL_BYTES = 10 * 1024 * 1024;

const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

// A deploy file path is a relative POSIX path. Reject anything that could escape
// the version directory (absolute, "..", "." segments, backslashes).
export const isSafeDeployPath = (p: string): boolean => {
  if (p.length === 0 || p.length > 1024 || p.startsWith("/") || p.includes("\\")) return false;
  return p
    .split("/")
    .every((seg) => seg.length > 0 && seg !== "." && seg !== ".." && SEGMENT_REGEX.test(seg));
};

export const validateDeploymentFiles = (files: DeployFile[]): HostingError | null => {
  if (files.length === 0) return { kind: "invalid_input", message: "no files in deployment" };
  if (files.length > DEPLOY_MAX_FILES) {
    return { kind: "invalid_input", message: `too many files (max ${DEPLOY_MAX_FILES})` };
  }
  let total = 0;
  for (const f of files) {
    if (!isSafeDeployPath(f.path)) {
      return { kind: "invalid_input", message: `unsafe file path: ${f.path}` };
    }
    total += f.bytes.byteLength;
  }
  if (total > DEPLOY_MAX_TOTAL_BYTES) {
    return { kind: "invalid_input", message: `deployment exceeds ${DEPLOY_MAX_TOTAL_BYTES} bytes` };
  }
  if (!files.some((f) => f.path === "index.html")) {
    return { kind: "invalid_input", message: "deployment must contain an index.html at the root" };
  }
  return null;
};

// Writes an immutable deployment to <appsDir>/<slug>/<deploymentId>/. Every
// destination is re-checked to stay within the version dir (defense in depth on
// top of isSafeDeployPath).
export const writeDeployment = async (versionDir: string, files: DeployFile[]): Promise<void> => {
  await mkdir(versionDir, { recursive: true });
  for (const f of files) {
    const dest = resolve(versionDir, f.path);
    const within = relative(versionDir, dest);
    if (within.startsWith("..") || isAbsolute(within)) {
      throw new Error(`unsafe deploy path: ${f.path}`);
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, f.bytes);
  }
};

// Reads an immutable deployment back into memory as relative-pathed files, for
// the read-then-redeploy edit loop (full-replace deploys carry no diff).
export const readDeployment = async (versionDir: string): Promise<DeployFile[]> => {
  const out: DeployFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const rel = relative(versionDir, full).split(sep).join("/");
      out.push({ path: rel, bytes: await readFile(full) });
    }
  };
  await walk(versionDir);
  return out;
};

export const removeAppDir = async (appsDir: string, slug: string): Promise<void> => {
  await rm(join(appsDir, slug), { recursive: true, force: true });
};
