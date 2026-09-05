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

/** Eligibility per 245D: assigned, oriented to the person, and not out of compliance. */
async function checkEligibility(staffId: string, personId: string): Promise<string | null> {
  const s = await getStaff(staffId);
  if (!s || !s.active) return "That staff member is inactive.";
  const a = (await listAssignmentsForStaff(staffId)).find((x) => x.assignment.active && x.person.id === personId);
  if (!a) return "That caregiver is not assigned to this client.";
  if (!a.assignment.orientedOn) return "That caregiver has not been oriented to this client (245D.09, subd. 4a).";
  const creds = (await listAllCredentials()).get(staffId) ?? [];
  if (complianceSummary(evaluateCompliance(s.hireDate, creds)).overdue > 0) return "That caregiver has overdue compliance items.";
  return null;
}

export async function createShifts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = shiftSchema.safeParse({ ...formToObject(fd), weekdays: fd.getAll("weekdays[]").map(String) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the fields." };
  const d = parsed.data;
  const agreement = await getAgreement(d.serviceAgreementId);
  if (!agreement || agreement.personId !== d.personId || agreement.status !== "active") return { errors: { serviceAgreementId: "Choose an active agreement for this client" } };
  const problem = await checkEligibility(d.staffId, d.personId);
  if (problem) return { errors: { staffId: problem } };
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
  return created.length ? { message: `${created.length} shift${created.length === 1 ? "" : "s"} scheduled.` } : { message: "No shifts created. The caregiver already has a shift at that time or the agreement has ended." };
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
