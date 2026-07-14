// A collection name is a URL path segment (`/_api/db/<collection>`); keep it to a
// small, safe charset.
export const COLLECTION_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// Records ride inside the single SQLite db (which Litestream replicates), so keep
// each document small.
export const MAX_RECORD_BYTES = 64 * 1024;

// Two per-app ceilings: one leaked share link must not be able to fill the single
// SQLite file (and its replication target) without bound. The record cap alone
// leaves 10k x 64 KiB of headroom, so the byte cap is the one that actually bounds
// the disk; both are checked on every write that can grow the app's footprint.
//
// The byte cap also bounds READ memory, which is why it is this small. A collection
// is fetched whole (GET /_api/db/<collection> returns every record — no cursor, so
// app code stays a single fetch), and the cap is per-app across all collections, so
// no single response can exceed it. Serving one costs roughly 4x the stored bytes in
// peak RSS — SQLite TEXT, then the parsed records, then the re-serialized array, all
// live at once — so 8 MiB stored is ~32 MiB per in-flight list. Raise this and a
// leaked link can OOM the process that serves every app and the dashboard.
export const MAX_RECORDS_PER_APP = 10_000;
export const MAX_STORE_TOTAL_BYTES_PER_APP = 8 * 1024 * 1024;

export const isValidCollection = (collection: string): boolean => COLLECTION_REGEX.test(collection);
