// A collection name is a URL path segment (`/_api/db/<collection>`); keep it to a
// small, safe charset.
export const COLLECTION_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// Records ride inside the single SQLite db (which Litestream replicates), so keep
// each document small.
export const MAX_RECORD_BYTES = 64 * 1024;

export const isValidCollection = (collection: string): boolean => COLLECTION_REGEX.test(collection);
