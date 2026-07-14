// A collection name is a URL path segment (`/_api/db/<collection>`); keep it to a
// small, safe charset.
export const COLLECTION_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// Records ride inside the single SQLite db (which Litestream replicates), so keep
// each document small.
export const MAX_RECORD_BYTES = 64 * 1024;

// A per-app ceiling on stored records: one leaked share link must not be able to
// fill the single SQLite file (and its replication target) without bound.
export const MAX_RECORDS_PER_APP = 10_000;

// `list` returns the most recent records up to this cap so a large collection
// can't force every open client tab to pull the whole table on boot / poll.
export const LIST_LIMIT = 1_000;

export const isValidCollection = (collection: string): boolean => COLLECTION_REGEX.test(collection);
