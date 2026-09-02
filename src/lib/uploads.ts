import path from "node:path";

/** Root for uploaded documents (gitignored). Paths stored in the database are relative to this. */
export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
