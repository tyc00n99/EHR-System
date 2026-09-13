"use server";

import { and, eq, gt, gte, lt, lte, ne, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getAgreement, listAllCredentials, listAssignmentsForStaff, getStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";
import { fromLocalInput } from "@/lib/format";
import { fieldErrors, formToObject, shiftSchema, type ActionState } from "@/lib/validation";

const { shifts } = schema;

/**
 * Eligibility per 245D. Two things stop a shift being made at all: the caregiver must be assigned
 * to the person and must have been oriented to them (245D.09 subd. 4a — the statute is explicit).
 * Overdue compliance items do not block scheduling; they come back as a warning, because the
 * training can be caught up before the shift and refusing to book it only pushed the work into
 * someone's spreadsheet.
 */
async function checkEligibility(staffId: string, personId: string): Promise<{ problem?: string; warning?: string }> {
  const s = await getStaff(staffId);
  if (!s || !s.active) return { problem: "That staff member is inactive." };
  const a = (await listAssignmentsForStaff(staffId)).find((x) => x.assignment.active && x.person.id === personId);
  if (!a) return { problem: "That caregiver is not assigned to this client." };
  if (!a.assignment.orientedOn) return { problem: "That caregiver has not been oriented to this client (245D.09, subd. 4a)." };
  const creds = (await listAllCredentials()).get(staffId) ?? [];
  const overdue = complianceSummary(evaluateCompliance(s.hireDate, creds)).overdue;
  return overdue > 0 ? { warning: `${s.firstName} ${s.lastName} has ${overdue} overdue compliance item${overdue === 1 ? "" : "s"} — see Compliance before the first shift.` } : {};
}

export async function createShifts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = shiftSchema.safeParse({ ...formToObject(fd), weekdays: fd.getAll("weekdays[]").map(String) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the fields." };
  const d = parsed.data;
  const agreement = await getAgreement(d.serviceAgreementId);
  if (!agreement || agreement.personId !== d.personId || agreement.status !== "active") return { errors: { serviceAgreementId: "Choose an active agreement for this client" } };
  const eligibility = await checkEligibility(d.staffId, d.personId);
  if (eligibility.problem) return { errors: { staffId: eligibility.problem } };
  const db = await getDb();
  // The chosen weekdays, or just the weekday of the start date when none are ticked.
  const first = new Date(d.date + "T12:00:00Z");
  const days = d.weekdays.length ? [...new Set(d.weekdays)].sort((a, b) => a - b) : [first.getUTCDay()];
  const dates: string[] = [];
  const weekStart = new Date(first); weekStart.setUTCDate(weekStart.getUTCDate() - first.getUTCDay());
  for (let week = 0; week < d.repeatWeeks; week++) {
    for (const wd of days) {
      const day = new Date(weekStart); day.setUTCDate(weekStart.getUTCDate() + week * 7 + wd);
      const iso = day.toISOString().slice(0, 10);
      if (iso < d.date || iso > agreement.endDate) continue;
      dates.push(iso);
    }
  }
  if (dates.length === 0) return { errors: { date: "That combination lands on no dates before the agreement ends." } };
  const seriesId = dates.length > 1 ? randomUUID() : null;
  const created: string[] = [];
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    for (const iso of dates) {
      const startAt = fromLocalInput(`${iso}T${d.start}`), endAt = fromLocalInput(`${iso}T${d.end}`);
      // overlap check for the caregiver
      const clash = await tx.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.staffId, d.staffId), ne(shifts.status, "cancelled"), or(and(lte(shifts.startAt, startAt), gt(shifts.endAt, startAt)), and(lt(shifts.startAt, endAt), gte(shifts.endAt, endAt)), and(gte(shifts.startAt, startAt), lte(shifts.endAt, endAt)))));
      if (clash.length) continue;
      const row = await w.insert(shifts, { personId: d.personId, staffId: d.staffId, serviceAgreementId: d.serviceAgreementId, startAt, endAt, note: d.note ?? null, seriesId, createdBy: user.id });
      created.push(row.id);
    }
  });
  revalidatePath("/scheduling");
  revalidatePath("/");
  if (!created.length) return { message: "No shifts created. The caregiver already has a shift at that time or the agreement has ended." };
  return { ok: true, message: `${created.length} event${created.length === 1 ? "" : "s"} scheduled.${eligibility.warning ? ` ${eligibility.warning}` : ""}` };
}

export async function cancelShift(id: string, scope: "one" | "series"): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [s] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
  if (!s) return { message: "Shift not found." };
  const targets = scope === "series" && s.seriesId ? await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.seriesId, s.seriesId), gte(shifts.startAt, s.startAt), eq(shifts.status, "scheduled"))) : [{ id }];
  const w = audited(db, { userId: user.id });
  for (const t of targets) await w.update(shifts, t.id, { status: "cancelled" });
  revalidatePath("/scheduling");
  return { message: `${targets.length} shift${targets.length === 1 ? "" : "s"} cancelled.` };
}

export async function markMissed(id: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(shifts, id, { status: "missed" });
  revalidatePath("/scheduling");
  return { message: "Marked missed." };
}

/** The reasons offered in the bulk-cancel form and in Schedule settings. */
export async function listCancellationReasons() {
  const db = await getDb();
  return db.select().from(schema.cancellationReasons).orderBy(schema.cancellationReasons.label);
}

/**
 * Bulk cancel, the reference's one bulk action. A cancelled event stays on the schedule in red and
 * can be rebooked — deleting it would erase the fact that the visit was meant to happen, which is
 * exactly what a county reviewer asks about.
 */
export async function bulkCancelShifts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const ids = fd.getAll("ids[]").map(String).filter(Boolean);
  const cancelledBy = String(fd.get("cancelledBy") ?? "");
  const reasonId = String(fd.get("cancelReasonId") ?? "");
  const note = String(fd.get("cancelNote") ?? "").slice(0, 500);
  if (!ids.length) return { message: "Select at least one event to cancel." };
  if (!cancelledBy) return { errors: { cancelledBy: "Say who cancelled" } };
  if (!reasonId) return { errors: { cancelReasonId: "Choose a reason" } };

  const db = await getDb();
  const w = audited(db, { userId: user.id });
  let done = 0;
  for (const id of ids) {
    const [row] = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    if (!row || row.status === "cancelled" || row.status === "completed") continue;
    await w.update(shifts, id, { status: "cancelled", cancelledBy, cancelReasonId: reasonId, cancelNote: note || null });
    done++;
  }
  revalidatePath("/scheduling");
  return { message: done ? `${done} event${done === 1 ? "" : "s"} cancelled.` : "Nothing was cancelled — those events are already cancelled or completed.", ok: true };
}

/** Schedule settings: the cancellation reason list. */
export async function saveCancellationReason(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const id = String(fd.get("id") ?? "");
  const label = String(fd.get("label") ?? "").trim().slice(0, 80);
  if (!label) return { errors: { label: "Give the reason a name" } };
  const db = await getDb();
  const w = audited(db, { userId: user.id });
  if (id) await w.update(schema.cancellationReasons, id, { label });
  else await w.insert(schema.cancellationReasons, { label });
  revalidatePath("/scheduling/settings");
  return { ok: true, message: id ? "Reason renamed." : "Reason added." };
}

export async function deleteCancellationReason(id: string): Promise<{ message?: string }> {
  const user = await requireUser(["admin"]);
  const db = await getDb();
  // A reason already written onto a cancelled shift is retired rather than removed, so the history
  // still reads back. Only an unused one is actually deleted.
  const [used] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.cancelReasonId, id)).limit(1);
  const w = audited(db, { userId: user.id });
  if (used) await w.update(schema.cancellationReasons, id, { active: false });
  else await w.delete(schema.cancellationReasons, id);
  revalidatePath("/scheduling/settings");
  return { message: used ? "That reason is on past cancellations, so it was retired rather than deleted." : "Reason deleted." };
}

/** Schedule settings: which days and hours the calendar draws. */
export async function saveCalendarSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const start = Number(fd.get("scheduleStartHour"));
  const end = Number(fd.get("scheduleEndHour"));
  const days = fd.getAll("days[]").map(Number).filter((n) => n >= 0 && n <= 6);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || end <= start) {
    return { errors: { scheduleEndHour: "The day has to end after it starts" } };
  }
  if (!days.length) return { errors: { days: "Show at least one day" } };
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  if (!org) return { message: "No organisation on file." };
  await audited(db, { userId: user.id }).update(schema.organizations, org.id, {
    scheduleStartHour: start, scheduleEndHour: end, scheduleDays: [...new Set(days)].sort((a, b) => a - b),
  });
  revalidatePath("/scheduling");
  revalidatePath("/scheduling/settings");
  return { ok: true, message: "Calendar settings saved." };
}
