"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getPerson } from "@/db/queries";
import { aiConfigured, explainAiError, extractAgreementFromPdf, type ExtractedAgreement } from "@/lib/ai/extract-agreement";
import { requireUser } from "@/lib/auth";
import { generateClientCode } from "@/lib/client-code";
import { hashPassword } from "@/lib/password";
import { putFile } from "@/lib/storage";
import { agreementSchema, fieldErrors, formToObject, personSchema, type ActionState } from "@/lib/validation";

export async function createPerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = personSchema.safeParse({ ...formToObject(fd), medicationSupport: fd.get("medicationSupport") === "true" });
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
  revalidatePath("/clients");
  redirect(`/clients/${id}`);
}

export async function updatePerson(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = personSchema.safeParse({ ...formToObject(fd), medicationSupport: fd.get("medicationSupport") === "true" });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const values = Object.fromEntries(Object.keys(personSchema.shape).map((k) => [k, (parsed.data as Record<string, unknown>)[k] ?? null]));
  await audited(db, { userId: user.id }).update(schema.people, id, values);
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

/** Generates a new six-digit signing code for the person and returns it once. Only the hash is stored. */
export async function setClientCode(personId: string): Promise<{ code?: string; message?: string }> {
  const user = await requireUser(["admin", "supervisor"]);
  const person = await getPerson(personId);
  if (!person) return { message: "Client not found." };
  const code = generateClientCode();
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.people, personId, { signatureCodeHash: await hashPassword(code), signatureCodeSetAt: new Date() });
  revalidatePath(`/clients/${personId}`);
  return { code };
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

export interface ExtractState extends ActionState {
  extracted?: ExtractedAgreement;
  documentPath?: string;
  documentName?: string;
  pmiMismatch?: boolean;
}

/** Stores the uploaded service agreement PDF and asks Claude to read the billing details out of it. */
export async function extractAgreement(personId: string, _prev: ExtractState, fd: FormData): Promise<ExtractState> {
  await requireUser(["admin", "supervisor"]);
  if (!aiConfigured()) return { message: "AI extraction is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the server." };
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
