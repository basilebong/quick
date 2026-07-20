// Inline files ride inside the single SQLite db so Litestream backs them up for
// free. 5 MiB keeps replication cheap; larger files are a future S3 path.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Two per-app ceilings: one leaked share link must not be able to fill the single
// SQLite file (and its replication target) without bound. The byte cap alone does not
// bind — an empty file sums to zero against it, yet still costs a row plus an entry in
// each of the three app_files indexes — so the count cap is what bounds an app whose
// files are tiny. For real files the byte cap binds first.
export const MAX_FILES_PER_APP = 10_000;
export const MAX_FILES_TOTAL_BYTES_PER_APP = 100 * 1024 * 1024;

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
