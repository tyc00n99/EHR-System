"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/validation";

export interface BulkResult extends ActionState { undo?: { kind: "unsigned" | "manual" | "missed_shift"; ids: string[]; prior?: { id: string; status: string }[] } }

const { visits, shifts } = schema;

function clean(ids: string[]) {
  return [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 200);
}

/**
 * Fixes several rows at once from Needs attention. Each action resolves the item it targets, so the
 * row leaves the list; nothing here hides a problem without recording why.
 */

/** Record the same "could not sign" reason on a batch of visits. */
export async function bulkRecordUnableToSign(ids: string[], reason: string): Promise<BulkResult> {
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
  return { message: `Reason recorded on ${open.length} note${open.length === 1 ? "" : "s"}.`, undo: { kind: "unsigned", ids: open.map((v) => v.id) } };
}

/** Confirm the evidence behind a batch of manual entries is on file. */
export async function bulkConfirmManualEvidence(ids: string[]): Promise<BulkResult> {
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
  return { message: `Evidence confirmed on ${rows.length} manual entr${rows.length === 1 ? "y" : "ies"}.`, undo: { kind: "manual", ids: rows.map((v) => v.id) } };
}

/** Cancel a batch of shifts nobody worked, so the calendar and this list stop counting them. */
export async function bulkCancelShifts(ids: string[]): Promise<BulkResult> {
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
  return { message: `${rows.length} shift${rows.length === 1 ? "" : "s"} cancelled.`, undo: { kind: "missed_shift", ids: rows.map((r) => r.id), prior: rows.map((r) => ({ id: r.id, status: r.status })) } };
}

/** Puts back exactly what the matching bulk action changed. Offered as Undo on the toast. */
export async function undoBulk(undo: NonNullable<BulkResult["undo"]>): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const list = clean(undo.ids);
  if (!list.length) return { message: "Nothing to undo." };
  const db = await getDb();
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    if (undo.kind === "unsigned") for (const id of list) await w.update(visits, id, { clientUnsignedReason: null, updatedBy: user.id });
    else if (undo.kind === "manual") for (const id of list) await w.update(visits, id, { manualEvidenceAt: null, manualEvidenceBy: null, updatedBy: user.id });
    else for (const p of undo.prior ?? []) await w.update(shifts, p.id, { status: p.status as "scheduled" | "in_progress" | "completed" | "cancelled" | "missed" });
  });
  revalidatePath("/attention");
  revalidatePath("/visits");
  revalidatePath("/scheduling");
  return { message: "Undone." };
}
