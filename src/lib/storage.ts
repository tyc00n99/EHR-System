import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Executor } from "@/db/audited";

/**
 * File storage for uploaded documents. Bytes live in the stored_files table so the app is stateless
 * on any host and files are only reachable through authenticated routes.
 * Paths are logical (e.g. "clients/<id>/<uuid>.pdf") and unique.
 */
export async function putFile(path: string, bytes: Uint8Array, contentType: string, tx?: Executor): Promise<void> {
  const db = tx ?? (await getDb());
  await db.delete(schema.storedFiles).where(eq(schema.storedFiles.path, path));
  await db.insert(schema.storedFiles).values({ path, contentType, sizeBytes: bytes.byteLength, bytes });
}

export async function getFile(path: string): Promise<{ bytes: Uint8Array; contentType: string; sizeBytes: number } | null> {
  const db = await getDb();
  const [row] = await db.select({ bytes: schema.storedFiles.bytes, contentType: schema.storedFiles.contentType, sizeBytes: schema.storedFiles.sizeBytes }).from(schema.storedFiles).where(eq(schema.storedFiles.path, path)).limit(1);
  if (!row) return null;
  return { ...row, bytes: row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes as ArrayBuffer) };
}

export async function deleteFile(path: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.storedFiles).where(eq(schema.storedFiles.path, path));
}
