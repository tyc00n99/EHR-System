"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { decryptField, encryptField, formatSsn } from "@/lib/crypto";
import { credentialSchema, fieldErrors, formToObject, loginSchema, staffSchema, type ActionState } from "@/lib/validation";

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
  const db = await getDb();
  const { hours, ...rest } = parsed.data;
  await audited(db, { userId: user.id }).insert(schema.staffCredentials, { ...rest, hours: hours != null ? hours.toFixed(1) : null });
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/staff");
  revalidatePath("/me");
  return {};
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
