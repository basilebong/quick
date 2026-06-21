// Inline files ride inside the single SQLite db so Litestream backs them up for
// free. 5 MiB keeps replication cheap; larger files are a future S3 path.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SEGMENT_REGEX = /^[A-Za-z0-9._-]+$/;

// A logical file key, possibly nested ("img/logo.png"). No leading slash, no
// "." / ".." segments — there is no archive extraction here, but the same
// hardening guards against surprising keys.
export const isValidFilePath = (p: string): boolean => {
  if (p.length === 0 || p.length > 1024 || p.startsWith("/")) return false;
  return p
    .split("/")
    .every((seg) => seg.length > 0 && seg !== "." && seg !== ".." && SEGMENT_REGEX.test(seg));
};
