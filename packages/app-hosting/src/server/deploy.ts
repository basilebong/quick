import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type DeployFile = { path: string; bytes: Uint8Array };

export const DEPLOY_MAX_FILES = 2000;
export const DEPLOY_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

// A deploy file path is a relative POSIX path. Reject anything that could escape
// the version directory (absolute, "..", "." segments, backslashes).
export const isSafeDeployPath = (p: string): boolean => {
  if (p.length === 0 || p.length > 1024 || p.startsWith("/") || p.includes("\\")) return false;
  return p
    .split("/")
    .every((seg) => seg.length > 0 && seg !== "." && seg !== ".." && SEGMENT_REGEX.test(seg));
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

export const removeAppDir = async (appsDir: string, slug: string): Promise<void> => {
  await rm(join(appsDir, slug), { recursive: true, force: true });
};
