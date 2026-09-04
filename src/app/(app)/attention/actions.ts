"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/validation";

const { visits, shifts } = schema;

function clean(ids: string[]) {
  return [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 200);
}

/**
 * Fixes several rows at once from Needs attention. Each action resolves the item it targets, so the
 * row leaves the list; nothing here hides a problem without recording why.
 */

/** Record the same "could not sign" reason on a batch of visits. */
export async function bulkRecordUnableToSign(ids: string[], reason: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const list = clean(ids);
  const text = reason.trim();
  if (!list.length) return { message: "Nothing selected." };
  if (text.length < 3) return { message: "Say why the client could not sign." };
  const db = await getDb();
  const rows = await db.select().from(visits).where(inArray(visits.id, list));
  const open = rows.filter((v) => !v.clientSignedAt);
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    for (const v of open) await w.update(visits, v.id, { clientUnsignedReason: text.slice(0, 200), updatedBy: user.id });
  });
  revalidatePath("/attention");
  revalidatePath("/visits");
  return { message: `Reason recorded on ${open.length} note${open.length === 1 ? "" : "s"}.` };
}

/** Confirm the evidence behind a batch of manual entries is on file. */
export async function bulkConfirmManualEvidence(ids: string[]): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const list = clean(ids);
  if (!list.length) return { message: "Nothing selected." };
  const db = await getDb();
  const rows = (await db.select().from(visits).where(inArray(visits.id, list))).filter((v) => v.manualEntry && !v.manualEvidenceAt);
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    for (const v of rows) await w.update(visits, v.id, { manualEvidenceAt: new Date(), manualEvidenceBy: user.id, updatedBy: user.id });
  });
  revalidatePath("/attention");
  revalidatePath("/visits");
  return { message: `Evidence confirmed on ${rows.length} manual entr${rows.length === 1 ? "y" : "ies"}.` };
}

/** Cancel a batch of shifts nobody worked, so the calendar and this list stop counting them. */
export async function bulkCancelShifts(ids: string[]): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const list = clean(ids);
  if (!list.length) return { message: "Nothing selected." };
  const db = await getDb();
  const rows = (await db.select().from(shifts).where(inArray(shifts.id, list))).filter((s) => s.status !== "completed");
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    for (const s of rows) await w.update(shifts, s.id, { status: "cancelled" });
  });
  revalidatePath("/attention");
  revalidatePath("/scheduling");
  return { message: `${rows.length} shift${rows.length === 1 ? "" : "s"} cancelled.` };
}
