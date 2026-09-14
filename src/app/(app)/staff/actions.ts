"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { decryptField, encryptField, formatSsn } from "@/lib/crypto";
import { availabilityScheduleSchema, credentialSchema, fieldErrors, formToObject, loginSchema, staffSchema, type ActionState } from "@/lib/validation";
import { textLayerFrom } from "@/lib/document-text";
import { categoryForCredential } from "@/lib/staff-documents";
import { storeStaffFile } from "./document-actions";

function normalize(fd: FormData) {
  const o = formToObject(fd);
  o.active = fd.get("active") === "on" || fd.get("active") === "true";
  if (typeof o.umpi === "string") o.umpi = o.umpi.toUpperCase();
  return o;
}

function withSsn<T extends { ssn?: string; payRate: number }>(data: T) {
  const { ssn, payRate, ...rest } = data;
  return { ...rest, payRate: payRate.toFixed(2), ...(ssn ? { ssnEncrypted: encryptField(ssn), ssnLast4: ssn.slice(-4) } : {}) };
}

export async function createStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = staffSchema.safeParse(normalize(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!parsed.data.ssn) return { errors: { ssn: "Required" } };
  const db = await getDb();
  const row = await audited(db, { userId: user.id }).insert(schema.staff, withSsn(parsed.data) as typeof schema.staff.$inferInsert);
  revalidatePath("/staff");
  redirect(`/staff/${row.id}`);
}

export async function updateStaff(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = staffSchema.safeParse(normalize(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const values = Object.fromEntries(Object.keys(staffSchema.shape).filter((k) => k !== "ssn" && k !== "payRate").map((k) => [k, (parsed.data as Record<string, unknown>)[k] ?? null]));
  await audited(db, { userId: user.id }).update(schema.staff, id, { ...values, ...withSsn(parsed.data) });
  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  redirect(`/staff/${id}`);
}

/* ---------- assignments ---------- */

export async function addAssignment(staffId: string, personId: string): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [existing] = await db.select().from(schema.assignments).where(and(eq(schema.assignments.staffId, staffId), eq(schema.assignments.personId, personId))).limit(1);
  const w = audited(db, { userId: user.id });
  if (existing) await w.update(schema.assignments, existing.id, { active: true });
  else await w.insert(schema.assignments, { staffId, personId });
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/clock");
  return {};
}

export async function endAssignment(id: string, staffId: string): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.assignments, id, { active: false });
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/clock");
}

/** Records 245D.09, subd. 4a orientation to this person's needs (today unless a date is given). */
export async function markOriented(id: string, staffId: string, date?: string): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.assignments, id, { orientedOn: date ?? new Date().toISOString().slice(0, 10) });
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/clock");
}

/* ---------- credentials ---------- */

export async function addCredential(staffId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = credentialSchema.safeParse({ ...formToObject(fd), staffId });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  // The certificate itself, when one was attached. Checked before the row is written so a bad
  // file does not leave a credential behind with nothing to back it.
  const file = fd.get("file");
  const attached = file instanceof File && file.size > 0 ? file : null;
  // Every personnel-file item except the date of hire has to be backed by a document, so a row
  // cannot be written without one. The licensor reads the paper, not the row.
  // "Meets position requirements" may be shown by a written source instead (a diploma on file,
  // years of experience per the application); everything else needs the paper.
  if (!attached && parsed.data.type !== "position_requirements") return { errors: { file: "Attach the document that shows this" } };
  if (!attached && parsed.data.type === "position_requirements" && !parsed.data.note?.trim()) return { errors: { note: "Say how they meet the requirements, or attach the document" } };
  const db = await getDb();
  const { hours, ...rest } = parsed.data;
  const row = await audited(db, { userId: user.id }).insert(schema.staffCredentials, { ...rest, hours: hours != null ? hours.toFixed(1) : null });
  if (attached) {
    // The form may have read the file already (the fields were filled from it); reuse that text
    // rather than reading the same page twice.
    const read = textLayerFrom(String(fd.get("extractedText") ?? ""), String(fd.get("extractionSummary") ?? ""));
    const stored = await storeStaffFile(user.id, staffId, attached, {
      category: categoryForCredential(rest.type), title: rest.title, credentialId: row.id, read,
    });
    if (stored.error) {
      await audited(db, { userId: user.id }).delete(schema.staffCredentials, row.id);
      return { errors: { file: stored.error } };
    }
  }
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/staff");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteCredential(id: string, staffId: string): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).delete(schema.staffCredentials, id);
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/staff");
}

/* ---------- logins ---------- */

export async function createLogin(staffId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = loginSchema.safeParse({ ...formToObject(fd), staffId });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  try {
    await audited(db, { userId: user.id }).insert(schema.users, { email: parsed.data.email.toLowerCase(), role: parsed.data.role, staffId, passwordHash: await hashPassword(parsed.data.password) });
  } catch (e) {
    if (String(e).includes("users_email_idx")) return { errors: { email: "That email already has a login" } };
    throw e;
  }
  revalidatePath(`/staff/${staffId}`);
  return {};
}

export async function updateLogin(userId: string, staffId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const role = String(fd.get("role") ?? "");
  const password = String(fd.get("password") ?? "");
  const active = fd.get("active") === "on";
  if (!["admin", "supervisor", "dsp"].includes(role)) return { errors: { role: "Choose a role" } };
  if (password && password.length < 10) return { errors: { password: "Use at least 10 characters" } };
  if (userId === user.id && (!active || role !== "admin")) return { message: "You cannot deactivate or demote your own login." };
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.users, userId, { role: role as "admin" | "supervisor" | "dsp", active, ...(password ? { passwordHash: await hashPassword(password) } : {}) });
  revalidatePath(`/staff/${staffId}`);
  return {};
}

/** Admin-only. Returns the full SSN and records the reveal in the audit log. */
export async function revealSsn(staffId: string): Promise<{ ssn?: string; message?: string }> {
  const user = await requireUser(["admin"]);
  const db = await getDb();
  const [row] = await db.select({ ssnEncrypted: schema.staff.ssnEncrypted }).from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  if (!row) return { message: "Staff member not found." };
  await audited(db, { userId: user.id }).event("reveal", staffId, "staff", { field: "ssn" });
  return { ssn: formatSsn(decryptField(row.ssnEncrypted)) };
}

/**
 * Replaces a caregiver's whole week in one audited pass, exactly as the client version does — a
 * partial write would leave the schedule describing a week nobody chose.
 */
export async function saveStaffAvailability(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const staffId = String(fd.get("staffId") ?? "");
  if (!staffId) return { error: "That form is missing which team member it belongs to." };
  let payload: unknown;
  try { payload = JSON.parse(String(fd.get("schedule") ?? "{}")); } catch { return { error: "The schedule could not be read. Reload and try again." }; }
  const parsed = availabilityScheduleSchema.safeParse(payload);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { startDate, endDate, timeZone, windows } = parsed.data;
  const db = await getDb();
  const w = audited(db, { userId: user.id });
  const existing = await db.select({ id: schema.staffAvailability.id }).from(schema.staffAvailability).where(eq(schema.staffAvailability.staffId, staffId));
  for (const row of existing) await w.delete(schema.staffAvailability, row.id);
  for (const win of windows) {
    await w.insert(schema.staffAvailability, { staffId, weekday: win.weekday, startTime: win.startTime, endTime: win.endTime, startDate, endDate: endDate ?? null, timeZone });
  }
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/scheduling");
  return { ok: true, message: windows.length ? "Availability saved." : "Availability cleared." };
}
