import "server-only";
import { cache } from "react";
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { getDb, schema } from "./index";
import { DEFAULT_PAY_RULES, type PayRule } from "@/lib/pay-period";
import type { OvertimeRules, PayNote } from "@/lib/pay";

/** The agency's pay schedule, oldest rule first. Read once per request. */
export const getPayRules = cache(async (): Promise<PayRule[]> => {
  const db = await getDb();
  const rows = await db.select().from(schema.paySchedules).orderBy(asc(schema.paySchedules.effectiveFrom));
  return rows.length ? rows.map((r) => ({ effectiveFrom: r.effectiveFrom, frequency: r.frequency, anchorDate: r.anchorDate })) : DEFAULT_PAY_RULES;
});

export async function listPaySchedules() {
  const db = await getDb();
  return db.select().from(schema.paySchedules).orderBy(asc(schema.paySchedules.effectiveFrom));
}

export const getOvertimeRules = cache(async (): Promise<OvertimeRules> => {
  const db = await getDb();
  const [o] = await db.select().from(schema.organizations).limit(1);
  return {
    weeklyHours: Number(o?.otWeeklyHours ?? 48),
    dailyHours: o?.otDailyHours != null ? Number(o.otDailyHours) : null,
    multiplier: Number(o?.otMultiplier ?? 1.5),
    workweekStartDay: o?.workweekStartDay ?? 0,
  };
});

/** A person's rates, oldest first. */
export async function listPayRates(staffId: string) {
  const db = await getDb();
  return db.select().from(schema.staffPayRates).where(eq(schema.staffPayRates.staffId, staffId)).orderBy(asc(schema.staffPayRates.effectiveFrom), asc(schema.staffPayRates.createdAt));
}

/** Every note this person clocked in to between two instants, void ones excluded. */
export async function listPayNotes(staffId: string, from: Date, to: Date): Promise<PayNote[]> {
  const db = await getDb();
  const v = schema.visits;
  const rows = await db
    .select({ id: v.id, personId: v.personId, first: schema.people.firstName, last: schema.people.lastName, preferred: schema.people.preferredName, serviceCode: v.serviceCode, modifiers: v.modifiers, clockInAt: v.clockInAt, clockOutAt: v.clockOutAt, status: v.status, staffSignedAt: v.staffSignedAt, clientSignedAt: v.clientSignedAt, clientUnsignedReason: v.clientUnsignedReason })
    .from(v)
    .innerJoin(schema.people, eq(v.personId, schema.people.id))
    .where(and(eq(v.staffId, staffId), ne(v.status, "void"), gte(v.clockInAt, from), lte(v.clockInAt, to)))
    .orderBy(asc(v.clockInAt));
  return rows.map((r) => ({
    id: r.id, personId: r.personId, clientName: `${r.preferred || r.first} ${r.last}`, serviceCode: r.serviceCode, modifiers: r.modifiers ?? [],
    clockInAt: r.clockInAt, clockOutAt: r.clockOutAt, open: r.status === "in_progress" || !r.clockOutAt,
    staffSigned: Boolean(r.staffSignedAt), clientSigned: Boolean(r.clientSignedAt), clientReason: r.clientUnsignedReason,
  }));
}
