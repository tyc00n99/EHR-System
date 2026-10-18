import "server-only";
import { and, eq, gt, gte, lt, lte, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getStaff, listAllCredentials, listAssignmentsForStaff } from "@/db/queries";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";

/**
 * Eligibility per 245D. Two things stop a shift being made at all: the caregiver must be assigned
 * to the person and must have been oriented to them (245D.09 subd. 4a — the statute is explicit).
 * Overdue compliance items do not block scheduling; they come back as a warning, because the
 * training can be caught up before the shift and refusing to book it only pushed the work into
 * someone's spreadsheet. Shared by the scheduler and by shift swaps in Messages.
 */
export async function checkEligibility(staffId: string, personId: string): Promise<{ problem?: string; warning?: string }> {
  const s = await getStaff(staffId);
  if (!s || !s.active) return { problem: "That staff member is inactive." };
  const a = (await listAssignmentsForStaff(staffId)).find((x) => x.assignment.active && x.person.id === personId);
  if (!a) return { problem: "That caregiver is not assigned to this client." };
  if (!a.assignment.orientedOn) return { problem: "That caregiver has not been oriented to this client." };
  const creds = (await listAllCredentials()).get(staffId) ?? [];
  const overdue = complianceSummary(evaluateCompliance(s.hireDate, creds)).overdue;
  return overdue > 0 ? { warning: `${s.firstName} ${s.lastName} has ${overdue} overdue compliance item${overdue === 1 ? "" : "s"} — see Compliance before the first shift.` } : {};
}

/** Does this caregiver already have a (not cancelled) shift overlapping the window? `except` skips one shift. */
export async function hasClash(staffId: string, startAt: Date, endAt: Date, except?: string): Promise<boolean> {
  const { shifts } = schema;
  const db = await getDb();
  const rows = await db.select({ id: shifts.id }).from(shifts).where(and(
    eq(shifts.staffId, staffId), ne(shifts.status, "cancelled"),
    ...(except ? [ne(shifts.id, except)] : []),
    or(and(lte(shifts.startAt, startAt), gt(shifts.endAt, startAt)), and(lt(shifts.startAt, endAt), gte(shifts.endAt, endAt)), and(gte(shifts.startAt, startAt), lte(shifts.endAt, endAt))),
  )).limit(1);
  return rows.length > 0;
}
