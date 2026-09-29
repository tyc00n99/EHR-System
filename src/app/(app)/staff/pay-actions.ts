"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireAbility } from "@/lib/auth";
import { chicagoDate } from "@/lib/pay-period";
import type { ActionState } from "@/lib/validation";

/**
 * Pay rate history and the overtime exemption (Sept 29, 2026). Seeing pay needs `view_pay`; changing it
 * also needs `manage_staff`. Every write is audited.
 */
async function authorize() {
  const user = await requireAbility("view_pay");
  if (!user.abilities.includes("manage_staff")) throw new Error("Changing pay needs the ability to add and edit staff.");
  return user;
}

/** Keeps `staff.payRate` equal to the rate in effect today. */
async function syncCurrentRate(staffId: string, userId: string) {
  const db = await getDb();
  const rates = await db.select().from(schema.staffPayRates).where(eq(schema.staffPayRates.staffId, staffId)).orderBy(asc(schema.staffPayRates.effectiveFrom), asc(schema.staffPayRates.createdAt));
  const today = chicagoDate(new Date());
  let current = rates[0];
  for (const r of rates) if (r.effectiveFrom <= today) current = r;
  if (current) await audited(db, { userId }).update(schema.staff, staffId, { payRate: current.rate });
}

export async function addPayRate(staffId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await authorize();
  const rate = Number(String(fd.get("rate") ?? "").replace(/[$,\s]/g, ""));
  const effectiveFrom = String(fd.get("effectiveFrom") ?? "");
  const note = String(fd.get("note") ?? "").trim() || null;
  const errors: Record<string, string> = {};
  if (!(rate > 0 && rate < 1000)) errors.rate = "Enter an hourly rate, like 18.50";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) errors.effectiveFrom = "Choose the date it starts";
  if (Object.keys(errors).length) return { errors };
  const db = await getDb();
  await audited(db, { userId: user.id }).insert(schema.staffPayRates, { staffId, rate: rate.toFixed(2), effectiveFrom, note, createdBy: user.id });
  await syncCurrentRate(staffId, user.id);
  revalidatePath(`/staff/${staffId}`);
  return { ok: true, message: `$${rate.toFixed(2)}/hr from ${effectiveFrom}.` };
}

/** For a rate entered by mistake. The last remaining rate cannot go — pay needs one. */
export async function deletePayRate(staffId: string, rateId: string): Promise<ActionState> {
  const user = await authorize();
  const db = await getDb();
  const rates = await db.select({ id: schema.staffPayRates.id }).from(schema.staffPayRates).where(eq(schema.staffPayRates.staffId, staffId));
  if (!rates.some((r) => r.id === rateId)) return { error: "That rate belongs to someone else." };
  if (rates.length === 1) return { error: "This is the only rate on record. Add the correct one first, then remove this one." };
  await audited(db, { userId: user.id }).delete(schema.staffPayRates, rateId);
  await syncCurrentRate(staffId, user.id);
  revalidatePath(`/staff/${staffId}`);
  return { ok: true, message: "Rate removed." };
}

export async function setOvertimeExempt(staffId: string, exempt: boolean): Promise<ActionState> {
  const user = await authorize();
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.staff, staffId, { overtimeExempt: exempt });
  revalidatePath(`/staff/${staffId}`);
  return { ok: true, message: exempt ? "Exempt from overtime." : "Overtime applies." };
}
