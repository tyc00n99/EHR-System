/**
 * Note locking for billing. A note is locked when a biller approves a claim that holds it: what it
 * said at that moment is frozen in `note_versions` (with a hash the claim version cites), and the
 * visit row can no longer change. A database trigger (migration 0041) enforces that; the checks
 * here exist to say so in words before the trigger has to. Later changes are addenda.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, max } from "drizzle-orm";
import type { Executor } from "@/db/audited";
import { audited, type Actor } from "@/db/audited";
import { claimLines, claims, goalEntries, medicationAdministrations, noteAddenda, noteVersions, visits } from "@/db/schema";
import { fmtDate } from "@/lib/format";

/** Claim statuses that keep a note on a claim. */
export const LIVE_CLAIM = ["sent", "accepted", "paid"] as const;

/** Stable JSON: keys sorted, dates as ISO strings, so the same note always hashes the same. */
export function canonical(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Fields that describe the lock itself, not the note. */
const LOCK_FIELDS = new Set(["lockedAt", "lockedBy", "updatedAt", "updatedBy"]);

async function snapshotOf(db: Executor, visitId: string) {
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId));
  if (!v) throw new Error("Note not found");
  const note = Object.fromEntries(Object.entries(v).filter(([k]) => !LOCK_FIELDS.has(k)));
  const [goals, meds] = await Promise.all([
    db.select({ goalId: goalEntries.goalId, body: goalEntries.body }).from(goalEntries).where(eq(goalEntries.visitId, visitId)),
    db.select({ medicationId: medicationAdministrations.medicationId, date: medicationAdministrations.scheduledDate, time: medicationAdministrations.scheduledTime, status: medicationAdministrations.status, note: medicationAdministrations.note }).from(medicationAdministrations).where(eq(medicationAdministrations.visitId, visitId)),
  ]);
  goals.sort((a, b) => a.goalId.localeCompare(b.goalId));
  meds.sort((a, b) => `${a.medicationId}${a.date}${a.time}`.localeCompare(`${b.medicationId}${b.date}${b.time}`));
  return { note, goals, meds };
}

export interface LockedNote { visitId: string; noteVersionId: string; versionNo: number; hash: string }

/** Freezes each note and locks it. Call inside the approval transaction. */
export async function lockNotes(tx: Executor, actor: Actor, visitIds: string[], reason: string, now: Date): Promise<Map<string, LockedNote>> {
  const out = new Map<string, LockedNote>();
  const a = audited(tx, actor);
  for (const visitId of visitIds) {
    const snapshot = await snapshotOf(tx, visitId);
    const hash = sha256(canonical(snapshot));
    const [{ last }] = await tx.select({ last: max(noteVersions.versionNo) }).from(noteVersions).where(eq(noteVersions.visitId, visitId));
    const version = await a.insert(noteVersions, { visitId, versionNo: (last ?? 0) + 1, reason, snapshot, hash, createdBy: actor.userId });
    await a.update(visits, visitId, { lockedAt: now, lockedBy: actor.userId });
    out.set(visitId, { visitId, noteVersionId: version.id, versionNo: version.versionNo, hash });
  }
  return out;
}

/**
 * Unlocks notes whose claims never left EVVora (taken back, or the send failed). A note still on
 * another live claim stays locked. Versions already written stay: they are the record.
 */
export async function unlockNotes(tx: Executor, actor: Actor, visitIds: string[]) {
  if (!visitIds.length) return;
  const stillLive = new Set((await tx.select({ visitId: claimLines.visitId }).from(claimLines).innerJoin(claims, eq(claimLines.claimId, claims.id))
    .where(and(inArray(claimLines.visitId, visitIds), inArray(claims.status, [...LIVE_CLAIM])))).map((r) => r.visitId));
  const a = audited(tx, actor);
  for (const id of visitIds) if (!stillLive.has(id)) await a.update(visits, id, { lockedAt: null, lockedBy: null });
}

/** The sentence an action returns instead of writing to a locked note. */
export function lockedMessage(v: { lockedAt: Date | null }): string | null {
  return v.lockedAt ? `This note was approved for billing on ${fmtDate(v.lockedAt)} and can no longer be changed. Add an addendum instead.` : null;
}

/** Records an addendum to a note. Allowed on any note, and the only way to add to a locked one. */
export async function addAddendum(db: Executor, actor: Actor & { userId: string }, visitId: string, body: string) {
  const text = body.trim();
  if (text.length < 3) return { ok: false as const, message: "Write what the addendum adds or corrects." };
  if (text.length > 4000) return { ok: false as const, message: "Keep an addendum under 4,000 characters." };
  const row = await audited(db, actor).insert(noteAddenda, { visitId, body: text, authorId: actor.userId });
  return { ok: true as const, id: row.id };
}
