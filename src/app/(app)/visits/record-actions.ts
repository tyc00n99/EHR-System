"use server";

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getVisitRecord } from "@/db/queries";
import { aiConfigured, explainAiError } from "@/lib/ai/extract-agreement";
import { requireUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { documentationSchema, fieldErrors, formToObject, medAdminSchema, type ActionState } from "@/lib/validation";

const { visits, goalResponses, medicationAdministrations, people } = schema;

function revalidateVisit(id: string, personId: string) {
  revalidatePath(`/visits/${id}`);
  revalidatePath("/visits");
  revalidatePath(`/clients/${personId}`);
  revalidatePath("/");
}

/** Saves structured documentation, goal responses, and the progress review. Optionally records the staff signature. */
export async function saveDocumentation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = documentationSchema.safeParse({ ...formToObject(fd), skills: fd.getAll("skills[]").map(String), activities: fd.getAll("activities[]").map(String), staffSign: fd.get("staffSign") === "true" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." };
  const d = parsed.data;
  const record = await getVisitRecord(d.visitId);
  if (!record) return { message: "Note not found." };
  const v = record.visit;
  if (user.role === "dsp" && v.staffId !== user.staffId) return { message: "This is not your visit." };
  if (v.status === "void") return { message: "Voided notes cannot be documented." };

  const db = await getDb();
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    const lat = Number(fd.get("lat")), lng = Number(fd.get("lng"));
    await w.update(visits, v.id, {
      interactionLevel: d.interactionLevel ?? null,
      skills: d.skills,
      activities: d.activities,
      shiftNote: d.shiftNote || null,
      staffSignedAt: d.staffSign ? new Date() : v.staffSignedAt,
      // Submitting accepts the note. Supervisors review in batches and return the ones they reject.
      approvedAt: d.staffSign ? new Date() : v.approvedAt,
      approvedBy: d.staffSign ? null : v.approvedBy,
      returnedAt: d.staffSign ? null : v.returnedAt,
      returnedBy: d.staffSign ? null : v.returnedBy,
      returnReason: d.staffSign ? null : v.returnReason,
      noteSavedAt: new Date(),
      noteSavedBy: user.id,
      noteSavedLat: Number.isFinite(lat) && fd.get("lat") ? lat : v.noteSavedLat,
      noteSavedLng: Number.isFinite(lng) && fd.get("lng") ? lng : v.noteSavedLng,
      updatedBy: user.id,
    });
    for (const { q } of record.questions) {
      const raw = fd.get(`goal_${q.id}`);
      const response = raw === "yes" || raw === "no" || raw === "na" ? raw : null;
      const note = String(fd.get(`goalnote_${q.id}`) ?? "").trim() || null;
      const existing = record.responses.find((r) => r.questionId === q.id);
      if (!response) { if (existing) await w.delete(goalResponses, existing.id); continue; }
      if (existing) await w.update(goalResponses, existing.id, { response, note });
      else await w.insert(goalResponses, { visitId: v.id, questionId: q.id, response, note });
    }
  });
  revalidateVisit(v.id, v.personId);
  return { message: d.staffSign ? "Documentation signed and saved." : "Documentation saved." };
}

/** Client co-signs from the service record with their signing code (for visits closed without one). */
export async function signVisitWithCode(visitId: string, code: string): Promise<ActionState> {
  const user = await requireUser();
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId)).limit(1);
  if (!v) return { message: "Note not found." };
  if (user.role === "dsp" && v.staffId !== user.staffId) return { message: "This is not your visit." };
  if (v.clientSignedAt) return { message: "Already signed." };
  const [person] = await db.select().from(people).where(eq(people.id, v.personId)).limit(1);
  if (!person?.signatureCodeHash) return { message: "This client has no signing code yet." };
  if (!/^\d{6}$/.test(code) || !(await verifyPassword(code, person.signatureCodeHash))) return { message: "That code is not correct." };
  await audited(db, { userId: user.id }).update(visits, v.id, { clientSignedAt: new Date(), clientUnsignedReason: null, updatedBy: user.id });
  revalidateVisit(v.id, v.personId);
  return { message: "Client signature recorded." };
}

/**
 * Notes are accepted when the caregiver submits them. A supervisor reviews in batches and returns
 * the ones that need work; the caregiver fixes and resubmits, which accepts it again.
 */
export async function returnNote(visitId: string, reason: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const text = reason.trim();
  if (text.length < 3) return { message: "Say what needs fixing so the caregiver can correct it." };
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId)).limit(1);
  if (!v) return { message: "Note not found." };
  await audited(db, { userId: user.id }).update(visits, v.id, { approvedAt: null, approvedBy: null, returnedAt: new Date(), returnedBy: user.id, returnReason: text.slice(0, 400), updatedBy: user.id });
  revalidateVisit(v.id, v.personId);
  return { message: "Returned to the caregiver." };
}

/** Supervisor accepts a note they had returned. */
export async function acceptNote(visitId: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [v] = await db.select().from(visits).where(eq(visits.id, visitId)).limit(1);
  if (!v) return { message: "Note not found." };
  if (!v.shiftNote) return { message: "Add a progress review first." };
  await audited(db, { userId: user.id }).update(visits, v.id, { approvedAt: new Date(), approvedBy: user.id, returnedAt: null, returnedBy: null, returnReason: null, updatedBy: user.id });
  revalidateVisit(v.id, v.personId);
  return { message: "Accepted." };
}

/** Asks Claude to draft the progress review from the structured fields. The caregiver edits it before signing. */
export async function draftProgressReview(visitId: string, input: { interactionLevel?: string; skills: string[]; goalAnswers: { prompt: string; response: string; note?: string }[]; tasks: string[]; notes: string }): Promise<{ text?: string; message?: string }> {
  const user = await requireUser();
  if (!aiConfigured()) return { message: "AI drafting is off. An admin can turn it on by adding ANTHROPIC_API_KEY to the app's environment settings and redeploying." };
  const record = await getVisitRecord(visitId);
  if (!record) return { message: "Note not found." };
  if (user.role === "dsp" && record.visit.staffId !== user.staffId) return { message: "This is not your visit." };
  const minutes = record.visit.clockOutAt ? Math.round((record.visit.clockOutAt.getTime() - record.visit.clockInAt.getTime()) / 60000) : null;
  const facts = [
    `Service: ${record.visit.serviceCode} ${record.visit.modifiers.join(" ")} (${record.program?.name ?? "245D service"})`,
    minutes != null ? `Duration: ${minutes} minutes` : "Visit in progress",
    input.interactionLevel ? `Level of interaction: ${input.interactionLevel}` : null,
    input.skills.length ? `Skills worked on: ${input.skills.join(", ")}` : null,
    input.tasks.length ? `Tasks completed: ${input.tasks.join(", ")}` : null,
    ...input.goalAnswers.map((g) => `Goal question "${g.prompt}": ${g.response}${g.note ? ` (${g.note})` : ""}`),
    input.notes ? `Caregiver's rough notes: ${input.notes}` : null,
  ].filter(Boolean).join("\n");
  try {
    const client = new Anthropic({ defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : undefined });
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 600,
      system: "You write progress notes for a Minnesota 245D home and community-based services provider. Write in plain, objective, past-tense prose from the caregiver's point of view, 3 to 6 sentences, one paragraph. Describe what the person did, what support was provided, and progress toward the goals mentioned. Use only the facts given. Do not invent events, quotes, times, or clinical judgments. Refer to the person by first name.",
      messages: [{ role: "user", content: `Person: ${record.person.firstName}\n${facts}\n\nWrite the progress review.` }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return text ? { text } : { message: "The draft came back empty. Try again." };
  } catch (e) {
    return { message: explainAiError(e) };
  }
}

/** Records one medication administration slot (given, refused, held, missed). */
export async function recordMedAdmin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = medAdminSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the fields." };
  const d = parsed.data;
  const db = await getDb();
  const [existing] = await db.select().from(medicationAdministrations).where(and(eq(medicationAdministrations.medicationId, d.medicationId), eq(medicationAdministrations.scheduledDate, d.scheduledDate), eq(medicationAdministrations.scheduledTime, d.scheduledTime))).limit(1);
  const w = audited(db, { userId: user.id });
  const values = { status: d.status, note: d.note ?? null, givenAt: d.status === "given" ? new Date() : null, recordedBy: user.id, staffId: user.staffId, visitId: d.visitId ?? null };
  if (existing) await w.update(medicationAdministrations, existing.id, values);
  else await w.insert(medicationAdministrations, { medicationId: d.medicationId, personId: d.personId, scheduledDate: d.scheduledDate, scheduledTime: d.scheduledTime, ...values });
  revalidatePath(`/clients/${d.personId}`);
  if (d.visitId) revalidatePath(`/visits/${d.visitId}`);
  return { message: "Recorded." };
}
