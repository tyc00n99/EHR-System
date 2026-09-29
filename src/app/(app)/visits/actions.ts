"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { findShiftForClockIn, getAgreement, getOrganization, getPerson, getStaff, listAssignmentsForStaff } from "@/db/queries";
import { requireAbility, requireUser, type CurrentUser } from "@/lib/auth";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { computeUnits } from "@/lib/units";
import { mirrorClockIn, mirrorClockOut, mirrorEdit, mirrorManualVisit, mirrorVoid } from "@/evv/bridge";
import { verifyPassword } from "@/lib/password";
import { geocodeAddress } from "@/lib/geocode";
import { activitiesFor, skillsFor } from "@/lib/templates";
import { MANUAL_REASONS, shiftTimes, type ManualContext, type ManualReason } from "@/lib/manual-note";
import {
  DEFAULT_TASKS,
  clockInSchema,
  clockOutSchema,
  fieldErrors,
  formToObject,
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
  if (open) return { message: "You are already clocked in. Clock out first." };

  if (!user.abilities.includes("edit_visits")) {
    const mine = (await listAssignmentsForStaff(user.staffId)).find((a) => a.assignment.active && a.person.id === d.personId);
    if (!mine) return { message: "This client is not assigned to you." };
    if (!mine.assignment.orientedOn) return { message: "Your orientation to this person has not been recorded. Ask your supervisor." };
  }
  try {
    const { person, agreement, snapshot } = await resolveSnapshot(d.personId, user.staffId, d.serviceAgreementId);
    if (person.status !== "active") return { message: "This client is not active." };
    if (!withinSpan(agreement, today())) return { message: "Today is outside the service agreement dates." };
    const shift = await findShiftForClockIn(user.staffId, d.personId, new Date());
    const row = await audited(db, { userId: user.id }).insert(visits, {
      shiftId: shift?.id ?? null,
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
    if (shift) await audited(db, { userId: user.id }).update(schema.shifts, shift.id, { status: "in_progress" });
    await mirrorClockIn(row, user);
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not clock in." };
  }
  revalidatePath("/clock");
  revalidatePath("/scheduling");
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
  if (!v) return { message: "Note not found." };
  if (v.status !== "in_progress") return { message: "This note is already closed." };
  if (v.staffId !== user.staffId && !user.abilities.includes("edit_visits")) return { message: "This is not your visit." };
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
  const closed = await audited(db, { userId: user.id }).update(visits, v.id, {
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
  if (v.shiftId) await audited(db, { userId: user.id }).update(schema.shifts, v.shiftId, { status: "completed" });
  await mirrorClockOut(closed, user);
  revalidatePath("/clock");
  revalidatePath("/");
  revalidatePath("/visits");
  revalidatePath("/scheduling");
  redirect(`/visits/${v.id}?done=1`);
}

/* ---------- manual note (Sept 29, 2026) ---------- */

/** Who may enter a manual note: an administrator or supervisor who is not the caregiver on it. */
async function requireManualAuthor() {
  const user = await requireAbility("edit_visits");
  if (user.role !== "admin" && user.role !== "supervisor") throw new Error("Only an administrator or a supervisor can enter a note manually.");
  return user;
}

/** Everything the manual note needs once a client's authorization and a date are chosen. */
export async function manualNoteContext(agreementId: string, date: string): Promise<ManualContext | { error: string }> {
  await requireManualAuthor();
  const agreement = await getAgreement(agreementId);
  if (!agreement) return { error: "Authorization not found." };
  const person = await getPerson(agreement.personId);
  if (!person) return { error: "Client not found." };
  const db = await getDb();
  const { goals, goalQuestions, medications, clientLocations, programs } = schema;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today();
  const [program, goalRows, questionRows, medRows, locationRows] = await Promise.all([
    agreement.programId ? db.select().from(programs).where(eq(programs.id, agreement.programId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    db.select({ id: goals.id, title: goals.title }).from(goals).where(and(eq(goals.personId, person.id), eq(goals.status, "active"))).orderBy(goals.createdAt),
    db.select({ id: goalQuestions.id, goalId: goalQuestions.goalId, prompt: goalQuestions.prompt }).from(goalQuestions).innerJoin(goals, eq(goalQuestions.goalId, goals.id)).where(and(eq(goals.personId, person.id), eq(goals.status, "active"), eq(goalQuestions.active, true))).orderBy(goalQuestions.sortOrder),
    db.select().from(medications).where(and(eq(medications.personId, person.id), eq(medications.active, true))).orderBy(medications.name),
    db.select().from(clientLocations).where(eq(clientLocations.personId, person.id)),
  ]);
  const address = (l: typeof locationRows[number]) => [l.address1, l.address2, [l.city, l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    personName: `${person.firstName} ${person.lastName}`, first: person.preferredName || person.firstName, pmi: person.pmi, dob: person.dob,
    unitMinutes: agreement.unitMinutes,
    skills: skillsFor(program?.serviceTypeId),
    activities: activitiesFor(person.preferredName || person.firstName, person.activityLibrary),
    goals: goalRows.map((g) => ({ ...g, questions: questionRows.filter((q) => q.goalId === g.id).map(({ id, prompt }) => ({ id, prompt })) })),
    meds: medRows.filter((m) => m.startDate <= day && (!m.endDate || m.endDate >= day)).flatMap((m) => m.times.map((time) => ({ id: m.id, name: m.name, dose: m.dose, time }))).sort((a, b) => a.time.localeCompare(b.time)),
    locations: locationRows.filter((l) => address(l)).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map((l) => ({ id: l.id, label: l.label || l.type, address: address(l), posCode: l.posCode, isDefault: l.isDefault })),
  };
}

/** Where one end of the visit happened: an address on file (its stored point, or looked up), or a typed one. */
async function resolvePlace(personId: string, choice: string, typed: string): Promise<{ lat: number; lng: number; address: string } | string> {
  const db = await getDb();
  if (choice && choice !== "typed") {
    const [l] = await db.select().from(schema.clientLocations).where(and(eq(schema.clientLocations.id, choice), eq(schema.clientLocations.personId, personId))).limit(1);
    if (!l) return "That address is not on this client's record.";
    const address = [l.address1, l.address2, [l.city, l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (l.lat != null && l.lng != null) return { lat: l.lat, lng: l.lng, address };
    const found = await geocodeAddress(address);
    return found ? { lat: found.lat, lng: found.lng, address } : "The address on file could not be found on the map. Type the address instead.";
  }
  if (typed.trim().length < 6) return "Type the street address, city and ZIP.";
  const found = await geocodeAddress(typed);
  return found ? { lat: found.lat, lng: found.lng, address: found.matched } : "That address could not be found. Check the street, city and ZIP.";
}

/**
 * Saves a manual note in one go: the visit, the documentation and the day's medications. Neither signature
 * is taken here — the office cannot sign for the caregiver or enter the client's code (user, Sept 29, 2026) —
 * so the note shows as unsigned, and its pay holds, until each of them signs.
 */
export async function createManualNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let user: CurrentUser;
  try { user = await requireManualAuthor(); } catch (e) { return { message: e instanceof Error ? e.message : "Not allowed." }; }
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const errors: Record<string, string> = {};
  const personId = g("personId"), staffId = g("staffId"), agreementId = g("serviceAgreementId");
  const date = g("date"), inTime = g("inTime"), outTime = g("outTime");
  if (!personId) errors.personId = "Choose the client";
  if (!agreementId) errors.serviceAgreementId = "Choose the authorization";
  if (!staffId) errors.staffId = "Choose the caregiver";
  else if (staffId === user.staffId) errors.staffId = "You cannot enter a manual note for a visit you worked. Ask another supervisor or administrator.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Choose the date";
  if (!/^\d{2}:\d{2}$/.test(inTime)) errors.inTime = "Clock-in time";
  if (!/^\d{2}:\d{2}$/.test(outTime)) errors.outTime = "Clock-out time";
  if (/^\d{2}:\d{2}$/.test(inTime) && inTime === outTime) errors.outTime = "Clock-out cannot equal clock-in";
  const placeOfService = g("placeOfService");
  if (!/^\d{2}$/.test(placeOfService)) errors.placeOfService = "Choose the setting";
  const narrative = g("shiftNote");
  if (narrative.length < 10) errors.shiftNote = "Write what happened during the visit";
  const reasonKey = g("reasonCategory") as ManualReason;
  const reasonLabel = MANUAL_REASONS.find(([k]) => k === reasonKey)?.[1];
  const reasonDetails = g("reasonDetails");
  if (!reasonLabel) errors.reasonCategory = "Choose why EVV did not capture this visit";
  if (reasonDetails.length < 5) errors.reasonDetails = "Say what happened and how the times were confirmed";
  const incidents = g("incidents") === "report" ? g("incidentNote") : "";
  if (g("incidents") === "report" && incidents.length < 5) errors.incidentNote = "Describe what happened";
  if (Object.keys(errors).length) return { errors, message: "Check the highlighted fields." };

  const db = await getDb();
  let id: string;
  try {
    const { agreement, snapshot } = await resolveSnapshot(personId, staffId, agreementId);
    const { clockIn, clockOut } = shiftTimes(date, inTime, outTime);
    const clockInAt = fromLocalInput(clockIn), clockOutAt = fromLocalInput(clockOut);
    if (!withinSpan(agreement, date)) return { errors: { date: "Outside the authorization dates" }, message: "Check the highlighted fields." };
    if (clockOutAt.getTime() > Date.now()) return { errors: { outTime: "That is in the future" }, message: "Check the highlighted fields." };
    const inPlace = await resolvePlace(personId, g("inLocation"), g("inAddress"));
    if (typeof inPlace === "string") return { errors: { inLocation: inPlace }, message: "Check the highlighted fields." };
    const outPlace = g("outSame") === "on" ? inPlace : await resolvePlace(personId, g("outLocation"), g("outAddress"));
    if (typeof outPlace === "string") return { errors: { outLocation: outPlace }, message: "Check the highlighted fields." };
    const levels = ["low", "medium", "high"];
    const level = levels.includes(g("interactionLevel")) ? g("interactionLevel") : null;
    const skills = fd.getAll("skills[]").map(String).filter(Boolean).slice(0, 40);
    const activities = fd.getAll("activities[]").map(String).filter(Boolean).slice(0, 40);

    const row = await db.transaction(async (tx) => {
      const w = audited(tx, { userId: user.id });
      const v = await w.insert(visits, {
        personId, staffId, serviceAgreementId: agreementId, programId: agreement.programId, ...snapshot,
        placeOfService, clockInAt, clockOutAt,
        clockInLat: inPlace.lat, clockInLng: inPlace.lng, clockOutLat: outPlace.lat, clockOutLng: outPlace.lng,
        clockInAddress: inPlace.address, clockOutAddress: outPlace.address,
        units: computeUnits(clockInAt, clockOutAt, agreement.unitMinutes),
        manualEntry: true,
        manualEntryReason: `${reasonLabel} — ${reasonDetails}`,
        // Neither signature is given here: the client co-signs with their own code later, the caregiver from their notes.
        clientSignedAt: null,
        clientUnsignedReason: null,
        interactionLevel: level as "low" | "medium" | "high" | null,
        skills, activities, tasks: [],
        shiftNote: narrative,
        incidentNote: incidents || null,
        noteSavedAt: new Date(), noteSavedBy: user.id,
        status: "completed", createdBy: user.id, updatedBy: user.id,
      });
      // Outcomes: yes/no answers to each question, and a log entry for every outcome answered or ticked as worked on.
      const worked = new Set(fd.getAll("goal_worked[]").map(String));
      const ctxGoals = await tx.select({ id: schema.goalQuestions.id, goalId: schema.goalQuestions.goalId }).from(schema.goalQuestions).innerJoin(schema.goals, eq(schema.goalQuestions.goalId, schema.goals.id)).where(and(eq(schema.goals.personId, personId), eq(schema.goals.status, "active"), eq(schema.goalQuestions.active, true)));
      for (const q of ctxGoals) {
        const r = String(fd.get(`goal_${q.id}`) ?? "");
        if (r === "yes" || r === "no" || r === "na") { await w.insert(schema.goalResponses, { visitId: v.id, questionId: q.id, response: r, note: null }); worked.add(q.goalId); }
      }
      const ownGoals = await tx.select({ id: schema.goals.id }).from(schema.goals).where(and(eq(schema.goals.personId, personId), eq(schema.goals.status, "active")));
      for (const goal of ownGoals) if (worked.has(goal.id)) await w.insert(schema.goalEntries, { goalId: goal.id, visitId: v.id, body: null, recordedBy: user.id });
      // The day's medications, recorded as given by the caregiver on the visit.
      for (const [k, val] of fd.entries()) {
        const m = /^med_([0-9a-f-]{36})_(\d{2}:\d{2})$/.exec(k);
        const status = String(val);
        if (!m || !["given", "refused", "held", "missed"].includes(status)) continue;
        const [med] = await tx.select().from(schema.medications).where(and(eq(schema.medications.id, m[1]), eq(schema.medications.personId, personId))).limit(1);
        if (!med) continue;
        const [existing] = await tx.select().from(schema.medicationAdministrations).where(and(eq(schema.medicationAdministrations.medicationId, med.id), eq(schema.medicationAdministrations.scheduledDate, date), eq(schema.medicationAdministrations.scheduledTime, m[2]))).limit(1);
        const values = { status: status as "given" | "refused" | "held" | "missed", note: null, givenAt: null, recordedBy: user.id, staffId, visitId: v.id };
        if (existing) await w.update(schema.medicationAdministrations, existing.id, values);
        else await w.insert(schema.medicationAdministrations, { medicationId: med.id, personId, scheduledDate: date, scheduledTime: m[2], ...values });
      }
      return v;
    });
    id = row.id;
    await mirrorManualVisit(row, user);
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Could not save the note." };
  }
  revalidatePath("/visits");
  revalidatePath(`/clients/${personId}`);
  redirect(`/visits?note=${id}`);
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
  const user = await requireAbility("edit_visits");
  const parsed = visitEditSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." };
  const d = parsed.data;
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, d.visitId)).limit(1);
  if (!v) return { message: "Note not found." };
  if (v.status === "void") return { message: "Voided notes cannot be edited." };
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
  await mirrorEdit(v.id, user, d.reason, changes);
  revalidatePath(`/visits/${v.id}`);
  revalidatePath("/visits");
  redirect(`/visits/${v.id}`);
}

export async function voidVisit(visitId: string, reason: string): Promise<ActionState> {
  const user = await requireAbility("edit_visits");
  if (reason.trim().length < 5) return { message: "Give a reason for voiding this visit." };
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId)).limit(1);
  if (!v) return { message: "Note not found." };
  if (v.status === "void") return { message: "Already void." };
  await recordEdit(user, v.id, reason, { status: { from: v.status, to: "void" } }, { status: "void", manualEntryReason: v.manualEntryReason ?? reason });
  await mirrorVoid(v.id, user, reason);
  revalidatePath(`/visits/${v.id}`);
  revalidatePath("/visits");
  return {};
}
