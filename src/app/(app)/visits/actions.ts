"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getAgreement, getOrganization, getPerson, getStaff, listAssignmentsForStaff } from "@/db/queries";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { computeUnits } from "@/lib/units";
import { verifyPassword } from "@/lib/password";
import {
  DEFAULT_TASKS,
  clockInSchema,
  clockOutSchema,
  fieldErrors,
  formToObject,
  manualVisitSchema,
  visitEditSchema,
  type ActionState,
} from "@/lib/validation";
import type { VisitTask } from "@/db/schema";

const { visits, visitEdits } = schema;

function taskList(codes: string[], completed: string[] = []): VisitTask[] {
  return DEFAULT_TASKS.filter((t) => codes.includes(t.code)).map((t) => ({ code: t.code, label: t.label, completed: completed.includes(t.code) }));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve everything a visit row snapshots. Throws a user-facing message on any gap. */
async function resolveSnapshot(personId: string, staffId: string, agreementId: string) {
  const [org, person, staffRow, agreement] = await Promise.all([getOrganization(), getPerson(personId), getStaff(staffId), getAgreement(agreementId)]);
  if (!person) throw new Error("Client not found.");
  if (!staffRow) throw new Error("Staff member not found.");
  if (!agreement || agreement.personId !== person.id) throw new Error("Service agreement does not belong to this client.");
  if (agreement.status !== "active") throw new Error(`Service agreement is ${agreement.status}.`);
  const rendering = staffRow.npi ? { renderingIdType: "npi" as const, renderingId: staffRow.npi } : staffRow.umpi ? { renderingIdType: "umpi" as const, renderingId: staffRow.umpi } : null;
  if (!rendering) throw new Error("Staff member has no NPI or UMPI on file.");
  return {
    person,
    staffRow,
    agreement,
    snapshot: {
      providerTaxId: org.taxId,
      pmi: person.pmi,
      serviceCode: agreement.serviceCode,
      modifiers: agreement.modifiers,
      ...rendering,
    },
  };
}

function withinSpan(agreement: { startDate: string; endDate: string }, isoDate: string) {
  return isoDate >= agreement.startDate && isoDate <= agreement.endDate;
}

export async function clockIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!user.staffId) return { message: "Your login is not linked to a staff record, so you cannot clock in." };
  const parsed = clockInSchema.safeParse({ ...formToObject(fd), tasks: fd.getAll("tasks[]").map(String) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." };
  const d = parsed.data;
  const db = await getDb();

  const [open] = await db.select({ id: visits.id }).from(visits).where(and(eq(visits.staffId, user.staffId), eq(visits.status, "in_progress"), isNull(visits.clockOutAt))).limit(1);
  if (open) return { message: "You already have a visit in progress. Clock out first." };

  if (user.role === "dsp") {
    const mine = (await listAssignmentsForStaff(user.staffId)).find((a) => a.assignment.active && a.person.id === d.personId);
    if (!mine) return { message: "This client is not assigned to you." };
    if (!mine.assignment.orientedOn) return { message: "Your orientation to this person has not been recorded. Ask your supervisor." };
  }
  try {
    const { person, agreement, snapshot } = await resolveSnapshot(d.personId, user.staffId, d.serviceAgreementId);
    if (person.status !== "active") return { message: "This client is not active." };
    if (!withinSpan(agreement, today())) return { message: "Today is outside the service agreement dates." };
    await audited(db, { userId: user.id }).insert(visits, {
      personId: d.personId,
      staffId: user.staffId,
      serviceAgreementId: d.serviceAgreementId,
      programId: agreement.programId,
      ...snapshot,
      placeOfService: d.placeOfService,
      clockInAt: new Date(),
      clockInLat: d.lat,
      clockInLng: d.lng,
      clockInAccuracyM: d.accuracy ?? null,
      manualEntry: false,
      tasks: taskList(d.tasks),
      status: "in_progress",
      createdBy: user.id,
      updatedBy: user.id,
    });
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not clock in." };
  }
  revalidatePath("/clock");
  revalidatePath("/");
  redirect("/clock");
}

export async function clockOut(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = clockOutSchema.safeParse({ ...formToObject(fd), completedTasks: fd.getAll("completedTasks[]").map(String), unableToSign: fd.get("unableToSign") === "true" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." };
  const d = parsed.data;
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, d.visitId)).limit(1);
  if (!v) return { message: "Visit not found." };
  if (v.status !== "in_progress") return { message: "This visit is already closed." };
  if (v.staffId !== user.staffId && user.role === "dsp") return { message: "This is not your visit." };
  const [agreement, person] = await Promise.all([getAgreement(v.serviceAgreementId), getPerson(v.personId)]);
  let clientSignedAt: Date | null = null;
  let clientUnsignedReason: string | null = null;
  if (d.unableToSign) {
    clientUnsignedReason = d.unableReason!.trim();
  } else {
    if (!person?.signatureCodeHash) return { errors: { clientCode: "This client has no signing code yet. A supervisor must generate one, or mark the person unable to sign." } };
    if (!(await verifyPassword(d.clientCode!, person.signatureCodeHash))) return { errors: { clientCode: "That code is not correct." } };
    clientSignedAt = new Date();
  }
  const clockOutAt = new Date();
  const units = computeUnits(v.clockInAt, clockOutAt, agreement?.unitMinutes ?? 15);
  await audited(db, { userId: user.id }).update(visits, v.id, {
    clockOutAt,
    clientSignedAt,
    clientUnsignedReason,
    clockOutLat: d.lat,
    clockOutLng: d.lng,
    clockOutAccuracyM: d.accuracy ?? null,
    tasks: v.tasks.map((t) => ({ ...t, completed: d.completedTasks.includes(t.code) })),
    shiftNote: d.shiftNote,
    units,
    status: "completed",
    updatedBy: user.id,
  });
  revalidatePath("/clock");
  revalidatePath("/");
  revalidatePath("/visits");
  redirect(`/visits/${v.id}?done=1`);
}

export async function createManualVisit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = manualVisitSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." };
  const d = parsed.data;
  const db = await getDb();
  let id: string;
  try {
    const { agreement, snapshot } = await resolveSnapshot(d.personId, d.staffId, d.serviceAgreementId);
    const clockInAt = fromLocalInput(d.clockInAt);
    const clockOutAt = fromLocalInput(d.clockOutAt);
    if (!withinSpan(agreement, clockInAt.toISOString().slice(0, 10))) return { errors: { clockInAt: "Outside the service agreement dates" } };
    const row = await audited(db, { userId: user.id }).insert(visits, {
      personId: d.personId,
      staffId: d.staffId,
      serviceAgreementId: d.serviceAgreementId,
      programId: agreement.programId,
      ...snapshot,
      placeOfService: d.placeOfService,
      clockInAt,
      clockOutAt,
      clockInLat: d.clockInLat,
      clockInLng: d.clockInLng,
      clockOutLat: d.clockOutLat,
      clockOutLng: d.clockOutLng,
      units: computeUnits(clockInAt, clockOutAt, agreement.unitMinutes),
      manualEntry: true,
      manualEntryReason: d.manualEntryReason,
      clientUnsignedReason: "Entered manually by a supervisor",
      tasks: [],
      shiftNote: d.shiftNote,
      status: "completed",
      createdBy: user.id,
      updatedBy: user.id,
    });
    id = row.id;
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not save the visit." };
  }
  revalidatePath("/visits");
  redirect(`/visits/${id}`);
}

type Diff = Record<string, { from: unknown; to: unknown }>;

async function recordEdit(user: CurrentUser, visitId: string, reason: string, changes: Diff, patch: Partial<typeof visits.$inferInsert>) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    await w.update(visits, visitId, { ...patch, manualEntry: true, manualEntryReason: patch.manualEntryReason ?? reason, evvStatus: "pending", updatedBy: user.id });
    await w.insert(visitEdits, { visitId, editedBy: user.id, reason, changes });
  });
}

export async function editVisit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = visitEditSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." };
  const d = parsed.data;
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, d.visitId)).limit(1);
  if (!v) return { message: "Visit not found." };
  if (v.status === "void") return { message: "Voided visits cannot be edited." };
  const agreement = await getAgreement(v.serviceAgreementId);
  // datetime-local inputs carry minute precision. Keep the original timestamp
  // (with seconds) when the minute the user saw is unchanged.
  const clockInAt = toLocalInput(v.clockInAt) === d.clockInAt ? v.clockInAt : fromLocalInput(d.clockInAt);
  const clockOutAt = v.clockOutAt && toLocalInput(v.clockOutAt) === d.clockOutAt ? v.clockOutAt : fromLocalInput(d.clockOutAt);
  const units = computeUnits(clockInAt, clockOutAt, agreement?.unitMinutes ?? 15);

  const changes: Diff = {};
  if (clockInAt.getTime() !== v.clockInAt.getTime()) changes.clockInAt = { from: v.clockInAt, to: clockInAt };
  if (!v.clockOutAt || clockOutAt.getTime() !== v.clockOutAt.getTime()) changes.clockOutAt = { from: v.clockOutAt, to: clockOutAt };
  if (d.placeOfService !== v.placeOfService) changes.placeOfService = { from: v.placeOfService, to: d.placeOfService };
  if (d.shiftNote !== (v.shiftNote ?? "")) changes.shiftNote = { from: v.shiftNote, to: d.shiftNote };
  if (units !== v.units) changes.units = { from: v.units, to: units };
  if (Object.keys(changes).length === 0) return { message: "Nothing changed." };

  await recordEdit(user, v.id, d.reason, changes, {
    clockInAt,
    clockOutAt,
    placeOfService: d.placeOfService,
    shiftNote: d.shiftNote,
    units,
    status: "completed",
    manualEntryReason: v.manualEntryReason ?? d.reason,
  });
  revalidatePath(`/visits/${v.id}`);
  revalidatePath("/visits");
  redirect(`/visits/${v.id}`);
}

export async function voidVisit(visitId: string, reason: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  if (reason.trim().length < 5) return { message: "Give a reason for voiding this visit." };
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId)).limit(1);
  if (!v) return { message: "Visit not found." };
  if (v.status === "void") return { message: "Already void." };
  await recordEdit(user, v.id, reason, { status: { from: v.status, to: "void" } }, { status: "void", manualEntryReason: v.manualEntryReason ?? reason });
  revalidatePath(`/visits/${v.id}`);
  revalidatePath("/visits");
  return {};
}
