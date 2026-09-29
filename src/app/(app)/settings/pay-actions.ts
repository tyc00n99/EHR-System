"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getOrganization } from "@/db/queries";
import { requireAbility } from "@/lib/auth";
import type { PayFrequency } from "@/lib/pay-period";
import type { ActionState } from "@/lib/validation";

const FREQUENCIES: PayFrequency[] = ["weekly", "biweekly", "semimonthly", "monthly"];

/** Every screen that groups by pay period reads the schedule, so a change revalidates them all. */
function refreshAll() {
  revalidatePath("/", "layout");
}

/**
 * Adds a pay schedule that takes effect on a date (Sept 29, 2026: "pay periods can change anytime").
 * Weekly and two-week periods count from that date; twice-monthly and monthly follow the calendar.
 * A schedule starting on the same date as an existing one replaces it.
 */
export async function savePaySchedule(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAbility("settings");
  const frequency = String(fd.get("frequency") ?? "") as PayFrequency;
  const effectiveFrom = String(fd.get("effectiveFrom") ?? "");
  const errors: Record<string, string> = {};
  if (!FREQUENCIES.includes(frequency)) errors.frequency = "Choose how often you pay";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) errors.effectiveFrom = "Choose the first day of the first period";
  if (Object.keys(errors).length) return { errors };
  const db = await getDb();
  const w = audited(db, { userId: user.id });
  const [same] = await db.select().from(schema.paySchedules).where(eq(schema.paySchedules.effectiveFrom, effectiveFrom)).limit(1);
  if (same) await w.update(schema.paySchedules, same.id, { frequency, anchorDate: effectiveFrom, createdBy: user.id });
  else await w.insert(schema.paySchedules, { effectiveFrom, frequency, anchorDate: effectiveFrom, createdBy: user.id });
  refreshAll();
  return { ok: true, message: "Pay schedule saved." };
}

/** Removes a schedule entered by mistake; the earlier one then runs on. The first cannot go. */
export async function deletePaySchedule(id: string): Promise<ActionState> {
  const user = await requireAbility("settings");
  const db = await getDb();
  const rows = await db.select().from(schema.paySchedules);
  if (rows.length <= 1) return { error: "There has to be one pay schedule." };
  await audited(db, { userId: user.id }).delete(schema.paySchedules, id);
  refreshAll();
  return { ok: true, message: "Schedule removed." };
}

export async function saveOvertimeRules(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAbility("settings");
  const weekly = Number(fd.get("weeklyHours"));
  const dailyRaw = String(fd.get("dailyHours") ?? "").trim();
  const daily = dailyRaw === "" ? null : Number(dailyRaw);
  const multiplier = Number(fd.get("multiplier"));
  const startDay = Number(fd.get("workweekStartDay"));
  const errors: Record<string, string> = {};
  if (!(weekly > 0 && weekly <= 168)) errors.weeklyHours = "Hours in a week, 1 to 168";
  if (daily != null && !(daily > 0 && daily <= 24)) errors.dailyHours = "Hours in a day, 1 to 24, or leave blank";
  if (!(multiplier >= 1 && multiplier <= 3)) errors.multiplier = "Between 1 and 3, like 1.5";
  if (!(Number.isInteger(startDay) && startDay >= 0 && startDay <= 6)) errors.workweekStartDay = "Choose a day";
  if (Object.keys(errors).length) return { errors };
  const db = await getDb();
  const org = await getOrganization();
  await audited(db, { userId: user.id }).update(schema.organizations, org.id, { otWeeklyHours: String(weekly), otDailyHours: daily == null ? null : String(daily), otMultiplier: String(multiplier), workweekStartDay: startDay });
  refreshAll();
  return { ok: true, message: "Overtime rules saved." };
}
