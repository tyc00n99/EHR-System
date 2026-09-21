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
