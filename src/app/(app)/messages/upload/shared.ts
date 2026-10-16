/** Limits shared by the composer, the upload route and `postMessage`. Plain constants: no server code. */
export const MAX_FILES = 6;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** One request per part; well under Vercel's 4.5 MB cap on a request body. */
export const PART_BYTES = 3 * 1024 * 1024;
export const pendingPrefix = (userId: string) => `messages/pending/${userId}/`;
