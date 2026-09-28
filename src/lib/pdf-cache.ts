/**
 * A small in-memory cache for rendered PDFs. Rendering a note takes half a second warm and
 * seconds cold, and a supervisor opening the same note twice in a minute should not pay twice.
 * Keys carry a hash of the note's content, so an edited note never serves the old page; the TTL
 * (ten minutes, Sept 21, 2026) bounds staleness for things the key cannot see (a medication
 * logged for that day).
 */
import { createHash } from "node:crypto";

const TTL_MS = 10 * 60_000;
const MAX = 50;
const store = new Map<string, { at: number; buffer: Buffer }>();

export const contentKey = (parts: unknown[]) => createHash("sha1").update(JSON.stringify(parts)).digest("hex");

export function cachedPdf(key: string): Buffer | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { store.delete(key); return null; }
  return hit.buffer;
}

export function rememberPdf(key: string, buffer: Buffer) {
  store.set(key, { at: Date.now(), buffer });
  if (store.size > MAX) { const oldest = store.keys().next().value; if (oldest) store.delete(oldest); }
}

/* ---------- the persistent layer ---------- */

import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";

const KEEP_DAYS = 30;
let lastPrune = 0;

/** A PDF any instance rendered before, or null. Memory first, then the table; a table hit is copied into memory. */
export async function cachedPdfAnywhere(key: string): Promise<Buffer | null> {
  const mem = cachedPdf(key);
  if (mem) return mem;
  const db = await getDb();
  const [row] = await db.select({ bytes: schema.renderedPdfs.bytes }).from(schema.renderedPdfs).where(eq(schema.renderedPdfs.key, key)).limit(1);
  if (!row) return null;
  const buffer = Buffer.from(row.bytes);
  rememberPdf(key, buffer);
  return buffer;
}

/** Keeps a fresh render in memory and in the table. The write is not awaited by the response; a failure only means the next instance renders again. */
export function rememberPdfEverywhere(key: string, buffer: Buffer) {
  rememberPdf(key, buffer);
  void (async () => {
    try {
      const db = await getDb();
      await db.insert(schema.renderedPdfs).values({ key, bytes: new Uint8Array(buffer), sizeBytes: buffer.byteLength }).onConflictDoNothing();
      if (Date.now() - lastPrune > 6 * 60 * 60_000) {
        lastPrune = Date.now();
        await db.delete(schema.renderedPdfs).where(lt(schema.renderedPdfs.createdAt, new Date(Date.now() - KEEP_DAYS * 86_400_000)));
      }
    } catch (e) { console.warn("rendered_pdfs write skipped", e instanceof Error ? e.message : e); }
  })();
}
