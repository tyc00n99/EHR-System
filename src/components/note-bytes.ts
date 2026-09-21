"use client";

/**
 * The bytes of rendered notes, kept in the browser (Sept 21, 2026, user: "make switching very
 * fast"). The server answers `/visits/<id>/note.pdf` with `no-store`, which is right for PHI in a
 * shared cache but means the browser refetched on every step; this keeps the last few notes'
 * bytes in memory for the session and lets the viewer fetch the neighbours before they are asked
 * for, so a step is a parse of bytes already here rather than a round trip and a render.
 */
const MAX = 40;
const bytes = new Map<string, ArrayBuffer>();
const inflight = new Map<string, Promise<ArrayBuffer>>();

export function getNoteBytes(id: string): Promise<ArrayBuffer> {
  const hit = bytes.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = fetch(`/visits/${id}/note.pdf`, { credentials: "same-origin" })
    .then(async (r) => { if (!r.ok) throw new Error(`Could not load the note (${r.status}).`); return r.arrayBuffer(); })
    .then((buf) => {
      bytes.set(id, buf);
      if (bytes.size > MAX) { const oldest = bytes.keys().next().value; if (oldest) bytes.delete(oldest); }
      return buf;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** Fetch in the background and ignore failures; a missed prefetch just means a normal load later. */
export function prefetchNoteBytes(id: string) {
  if (bytes.has(id) || inflight.has(id)) return;
  getNoteBytes(id).catch(() => {});
}

/** Drop what is held for one note, e.g. after it is edited or signed. */
export function forgetNoteBytes(id: string) {
  bytes.delete(id);
}
