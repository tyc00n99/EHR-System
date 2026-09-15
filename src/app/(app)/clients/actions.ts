"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getPerson, getOrganization } from "@/db/queries";
import { aiConfigured, explainAiError, extractAgreementFromPdf, type ExtractedAgreement } from "@/lib/ai/extract-agreement";
import { readIntakeDocument, readable, type IntakeRead } from "@/lib/ai/read-document";
import { requireUser } from "@/lib/auth";
import { issueClientCode } from "@/lib/client-code";
import { decryptField } from "@/lib/crypto";
import { putFile } from "@/lib/storage";
import { agreementSchema, fieldErrors, formToObject, personSchema, type ActionState, activityLibrarySchema } from "@/lib/validation";

export async function createPerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = personSchema.safeParse({ ...formToObject(fd), medicationSupport: fd.get("medicationSupport") === "true", smsConsent: fd.get("smsConsent") === "true" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  let id: string;
  try {
    const row = await audited(db, { userId: user.id }).insert(schema.people, parsed.data);
    id = row.id;
  } catch (e) {
    if (String(e).includes("people_pmi_idx")) return { errors: { pmi: "A client with this PMI number already exists" } };
    throw e;
  }
  const org = await getOrganization();
  const issued = await issueClientCode(db, user.id, { id, firstName: parsed.data.firstName, phone: parsed.data.phone ?? null, smsConsent: parsed.data.smsConsent }, org.name);
  revalidatePath("/clients");
  redirect(`/clients/${id}?code=${issued.texted ? "texted" : issued.code}`);
}

export async function updatePerson(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = personSchema.safeParse({ ...formToObject(fd), medicationSupport: fd.get("medicationSupport") === "true", smsConsent: fd.get("smsConsent") === "true" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const values = Object.fromEntries(Object.keys(personSchema.shape).map((k) => [k, (parsed.data as Record<string, unknown>)[k] ?? null]));
  await audited(db, { userId: user.id }).update(schema.people, id, values);
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

/** Generates a new six-digit signing code for the person. The hash verifies it; an encrypted copy lets an admin read it back. */
export async function setClientCode(personId: string): Promise<{ code?: string; texted?: boolean; message?: string; referenceError?: string }> {
  const user = await requireUser(["admin", "supervisor"]);
  const person = await getPerson(personId);
  if (!person) return { message: "Client not found." };
  const db = await getDb();
  const org = await getOrganization();
  const issued = await issueClientCode(db, user.id, { id: personId, firstName: person.firstName, phone: person.phone, smsConsent: person.smsConsent }, org.name);
  revalidatePath(`/clients/${personId}`);
  return { code: issued.code, texted: issued.texted, message: issued.texted ? undefined : issued.reason, referenceError: issued.referenceError };
}

/**
 * Reads back a client's current signing code.
 *
 * The code is a control against a caregiver signing on the client's behalf, so looking at one is a
 * deliberate act: admins and supervisors only, and every reveal lands in the audit log against the
 * client's record. Same treatment as a staff SSN.
 */
export async function revealClientCode(personId: string): Promise<{ code?: string; message?: string }> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [row] = await db
    .select({ enc: schema.people.signatureCodeEncrypted, hash: schema.people.signatureCodeHash })
    .from(schema.people)
    .where(eq(schema.people.id, personId))
    .limit(1);
  if (!row) return { message: "Client not found." };
  if (!row.hash) return { message: "No signing code has been issued yet." };
  if (!row.enc) return { message: "This code was issued before codes were kept readable. Generate a new one to get a reference copy." };
  await audited(db, { userId: user.id }).event("reveal", personId, "people", { field: "signatureCode" });
  try {
    return { code: decryptField(row.enc) };
  } catch {
    return { message: "The stored code could not be read. Generate a new one." };
  }
}

export async function createAgreement(personId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = agreementSchema.safeParse({ ...formToObject(fd), personId, modifiers: fd.getAll("modifiers[]").map(String) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const { unitRate, ...rest } = parsed.data;
  await audited(db, { userId: user.id }).insert(schema.serviceAgreements, { ...rest, unitRate: unitRate.toFixed(2), unitMinutes: 15 });
  revalidatePath(`/clients/${personId}`);
  redirect(`/clients/${personId}`);
}

export async function setAgreementStatus(id: string, personId: string, status: "active" | "cancelled" | "exhausted" | "expired") {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.serviceAgreements, id, { status });
  revalidatePath(`/clients/${personId}`);
}

/** Archives (or restores) an agreement. Only non-active ones can be archived; the row and its visits stay. */
export async function setAgreementArchived(id: string, personId: string, archived: boolean): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [a] = await db.select().from(schema.serviceAgreements).where(eq(schema.serviceAgreements.id, id)).limit(1);
  if (!a || a.personId !== personId) return { message: "Agreement not found." };
  if (archived && a.status === "active") return { message: "Cancel or expire the agreement before archiving it." };
  await audited(db, { userId: user.id }).update(schema.serviceAgreements, id, archived ? { archivedAt: new Date(), archivedBy: user.id } : { archivedAt: null, archivedBy: null });
  revalidatePath(`/clients/${personId}`);
  revalidatePath("/agreements");
  return { ok: true };
}

export interface ExtractState extends ActionState {
  extracted?: ExtractedAgreement;
  documentPath?: string;
  documentName?: string;
  pmiMismatch?: boolean;
}

/** Stores the uploaded service agreement PDF and asks Claude to read the billing details out of it. */
export async function extractAgreement(personId: string, _prev: ExtractState, fd: FormData): Promise<ExtractState> {
  await requireUser(["admin", "supervisor"]);
  if (!aiConfigured()) return { message: "AI extraction is off. An admin can turn it on by adding ANTHROPIC_API_KEY to the app's environment settings and redeploying. You can still type the authorization in by hand." };
  const file = fd.get("document");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a PDF first." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return { message: "Only PDF files are supported." };
  if (file.size > 20 * 1024 * 1024) return { message: "The PDF is larger than 20 MB." };

  const person = await getPerson(personId);
  if (!person) return { message: "Client not found." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const relPath = `agreements/${randomUUID()}.pdf`;
  await putFile(relPath, new Uint8Array(buffer), "application/pdf");

  try {
    const extracted = await extractAgreementFromPdf(buffer);
    const pmiMismatch = Boolean(extracted.pmi && extracted.pmi.replace(/\D/g, "") !== person.pmi);
    return { extracted, documentPath: relPath, documentName: file.name, pmiMismatch };
  } catch (e) {
    return { message: explainAiError(e), documentPath: relPath, documentName: file.name };
  }
}

/** One-click status change from the record header. Discharge records the date. */
export async function setPersonStatus(personId: string, status: "intake" | "active" | "discharged"): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.people, personId, { status, dischargedOn: status === "discharged" ? new Date().toISOString().slice(0, 10) : null });
  revalidatePath(`/clients/${personId}`);
  revalidatePath("/clients");
  return { message: status === "discharged" ? "Client discharged." : status === "active" ? "Client is active." : "Client moved to intake." };
}

export async function setMedicationSupport(personId: string, on: boolean): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.people, personId, { medicationSupport: on });
  revalidatePath(`/clients/${personId}`);
  return { message: on ? "Medication support turned on. The Medical tab is now visible." : "Medication support turned off." };
}

/** Replace a person's daily-activity library (one statement per line; {name} is filled with the first name). */
export async function setActivityLibrary(personId: string, text: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const activities = text.split("\n").map((l) => l.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
  const parsed = activityLibrarySchema.safeParse({ personId, activities });
  if (!parsed.success) return { message: "Each activity needs 3 to 240 characters, at most 60 lines." };
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.people, personId, { activityLibrary: parsed.data.activities });
  revalidatePath(`/clients/${personId}`);
  return { message: parsed.data.activities.length ? `${parsed.data.activities.length} activities saved.` : "Library cleared. The default list is back." };
}

const agreementEditSchema = agreementSchema;

/** Edit an existing agreement. Units, dates, and rate change when the county amends the SA. */
export async function updateAgreement(agreementId: string, personId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = agreementEditSchema.safeParse({ ...formToObject(fd), personId, modifiers: fd.getAll("modifiers[]").map(String) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." };
  const status = String(fd.get("status") ?? "active");
  if (!["active", "exhausted", "expired", "cancelled"].includes(status)) return { errors: { status: "Choose a status" } };
  const db = await getDb();
  const { unitRate, personId: _p, documentPath: _d, documentName: _n, ...rest } = parsed.data;
  void _p; void _d; void _n;
  await audited(db, { userId: user.id }).update(schema.serviceAgreements, agreementId, { ...rest, unitRate: unitRate.toFixed(2), status: status as "active" | "exhausted" | "expired" | "cancelled" });
  revalidatePath(`/clients/${personId}`);
  redirect(`/clients/${personId}?tab=authorizations`);
}

export interface IntakeReadState { read?: IntakeRead; fileName?: string; message?: string; readId?: number }

/**
 * Reads a referral packet, CSSP or prior record before a client exists, so the new-client form
 * fills in from it. Nothing is stored: the person reviews the draft and saves, and the packet is
 * filed under Documents once the record exists.
 */
export async function readIntakeFile(_prev: IntakeReadState, fd: FormData): Promise<IntakeReadState> {
  await requireUser(["admin", "supervisor"]);
  const readId = Date.now();
  if (!aiConfigured()) return { readId, message: "Document reading is off. An admin can turn it on by adding ANTHROPIC_API_KEY to the app's environment settings and redeploying. You can still type the client in by hand." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { readId, message: "Choose a file first." };
  if (file.size > 25 * 1024 * 1024) return { readId, message: "Files must be under 25 MB" };
  if (!readable(file.type, file.name)) return { readId, message: "Use a PDF or a photo. Word documents and HEIC images cannot be read." };
  try {
    const read = await readIntakeDocument(new Uint8Array(await file.arrayBuffer()), file.type || "application/pdf", file.name);
    return { readId, read, fileName: file.name };
  } catch (e) {
    return { readId, fileName: file.name, message: explainAiError(e) };
  }
}
