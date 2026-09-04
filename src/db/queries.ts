import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, sql, sum } from "drizzle-orm";
import { getDb, schema } from "./index";

const { people, staff, sites, programs, serviceAgreements, visits, visitEdits, auditLog, users, organizations, assignments, staffCredentials, clientDocuments, goals, goalQuestions, goalResponses, shifts, medications, medicationAdministrations } = schema;

export async function getOrganization() {
  const db = await getDb();
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Organization is not configured. Run `npm run db:seed`.");
  return org;
}

export async function listPeople() {
  const db = await getDb();
  return db.select().from(people).orderBy(people.lastName, people.firstName);
}

export async function getPerson(id: string) {
  const db = await getDb();
  const [p] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  return p ?? null;
}

export async function listStaff(activeOnly = false) {
  const db = await getDb();
  return db
    .select()
    .from(staff)
    .where(activeOnly ? eq(staff.active, true) : undefined)
    .orderBy(staff.lastName, staff.firstName);
}

export async function getStaff(id: string) {
  const db = await getDb();
  const [s] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
  return s ?? null;
}

export async function listSitesWithPrograms() {
  const db = await getDb();
  const s = await db.select().from(sites).orderBy(sites.name);
  const p = await db.select().from(programs).orderBy(programs.name);
  return s.map((site) => ({ ...site, programs: p.filter((x) => x.siteId === site.id) }));
}

export async function getSite(id: string) {
  const db = await getDb();
  const [s] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!s) return null;
  const p = await db.select().from(programs).where(eq(programs.siteId, id)).orderBy(programs.name);
  return { ...s, programs: p };
}

export async function listPrograms() {
  const db = await getDb();
  return db
    .select({ id: programs.id, name: programs.name, serviceTypeId: programs.serviceTypeId, siteName: sites.name, active: programs.active })
    .from(programs)
    .innerJoin(sites, eq(programs.siteId, sites.id))
    .orderBy(sites.name, programs.name);
}

/** Agreements for a person with units consumed by completed visits. */
export async function listAgreementsForPerson(personId: string) {
  const db = await getDb();
  const used = db
    .select({ agreementId: visits.serviceAgreementId, used: sum(visits.units).as("used") })
    .from(visits)
    .where(eq(visits.status, "completed"))
    .groupBy(visits.serviceAgreementId)
    .as("used");
  return db
    .select({
      agreement: serviceAgreements,
      programName: programs.name,
      serviceTypeId: programs.serviceTypeId,
      unitsUsed: sql<number>`coalesce(${used.used}, 0)::int`,
    })
    .from(serviceAgreements)
    .leftJoin(programs, eq(serviceAgreements.programId, programs.id))
    .leftJoin(used, eq(used.agreementId, serviceAgreements.id))
    .where(eq(serviceAgreements.personId, personId))
    .orderBy(desc(serviceAgreements.startDate));
}

export async function getAgreement(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(serviceAgreements).where(eq(serviceAgreements.id, id)).limit(1);
  return a ?? null;
}

/** Active agreements a staff member can clock against right now. Pass `staffId` to limit to that caregiver's assignments. */
export async function listClockableAgreements(staffId?: string) {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const assigned = staffId
    ? (await db.select({ personId: assignments.personId, orientedOn: assignments.orientedOn }).from(assignments).where(and(eq(assignments.staffId, staffId), eq(assignments.active, true))))
    : null;
  const rows = await db
    .select({
      agreement: serviceAgreements,
      person: people,
      programName: programs.name,
      serviceTypeId: programs.serviceTypeId,
    })
    .from(serviceAgreements)
    .innerJoin(people, eq(serviceAgreements.personId, people.id))
    .leftJoin(programs, eq(serviceAgreements.programId, programs.id))
    .where(
      and(
        eq(serviceAgreements.status, "active"),
        sql`${serviceAgreements.startDate} <= ${today}`,
        sql`${serviceAgreements.endDate} >= ${today}`,
        eq(people.status, "active"),
      ),
    )
    .orderBy(people.lastName, people.firstName);
  if (!assigned) return rows.map((r) => ({ ...r, orientedOn: null as string | null }));
  const byPerson = new Map(assigned.map((a) => [a.personId, a.orientedOn]));
  return rows.filter((r) => byPerson.has(r.person.id)).map((r) => ({ ...r, orientedOn: byPerson.get(r.person.id) ?? null }));
}

export async function listAssignmentsForStaff(staffId: string) {
  const db = await getDb();
  return db
    .select({ assignment: assignments, person: people })
    .from(assignments)
    .innerJoin(people, eq(assignments.personId, people.id))
    .where(eq(assignments.staffId, staffId))
    .orderBy(desc(assignments.active), people.lastName);
}

export async function listAssignmentsForPerson(personId: string) {
  const db = await getDb();
  return db
    .select({ assignment: assignments, staff })
    .from(assignments)
    .innerJoin(staff, eq(assignments.staffId, staff.id))
    .where(and(eq(assignments.personId, personId), eq(assignments.active, true)))
    .orderBy(staff.lastName);
}

export async function listCredentials(staffId: string) {
  const db = await getDb();
  return db.select().from(staffCredentials).where(eq(staffCredentials.staffId, staffId)).orderBy(desc(staffCredentials.completedOn));
}

/** All credentials keyed by staff id, for list-page status badges. */
export async function listAllCredentials() {
  const db = await getDb();
  const rows = await db.select().from(staffCredentials);
  const map = new Map<string, typeof rows>();
  for (const r of rows) map.set(r.staffId, [...(map.get(r.staffId) ?? []), r]);
  return map;
}

export async function getUserForStaff(staffId: string) {
  const db = await getDb();
  const [u] = await db.select({ id: users.id, email: users.email, role: users.role, active: users.active }).from(users).where(eq(users.staffId, staffId)).limit(1);
  return u ?? null;
}

/** Per-staff totals for a date range: completed visits, units, minutes, unsigned count. */
export async function staffPeriodTotals(staffId: string, from: Date, to: Date) {
  const db = await getDb();
  const rows = await db
    .select({ status: visits.status, units: visits.units, clockInAt: visits.clockInAt, clockOutAt: visits.clockOutAt, signed: visits.clientSignedAt })
    .from(visits)
    .where(and(eq(visits.staffId, staffId), gte(visits.clockInAt, from), lte(visits.clockInAt, to)));
  const completed = rows.filter((r) => r.status === "completed");
  return {
    visits: completed.length,
    units: completed.reduce((n, r) => n + r.units, 0),
    minutes: completed.reduce((n, r) => n + (r.clockOutAt ? Math.round((r.clockOutAt.getTime() - r.clockInAt.getTime()) / 60000) : 0), 0),
    unsigned: completed.filter((r) => !r.signed).length,
  };
}

export interface VisitFilter {
  personId?: string;
  staffId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function listVisits(f: VisitFilter = {}) {
  const db = await getDb();
  const where = [
    f.personId ? eq(visits.personId, f.personId) : undefined,
    f.staffId ? eq(visits.staffId, f.staffId) : undefined,
    f.from ? gte(visits.clockInAt, f.from) : undefined,
    f.to ? lte(visits.clockInAt, f.to) : undefined,
  ].filter(Boolean);
  return db
    .select({
      visit: visits,
      personFirst: people.firstName,
      personLast: people.lastName,
      staffFirst: staff.firstName,
      staffLast: staff.lastName,
      staffTitle: staff.title,
      agreementNumber: serviceAgreements.agreementNumber,
      agreementStart: serviceAgreements.startDate,
      agreementEnd: serviceAgreements.endDate,
      authorizedUnits: serviceAgreements.authorizedUnits,
      editCount: sql<number>`(select count(*) from ${visitEdits} where ${visitEdits.visitId} = ${visits.id})::int`,
    })
    .from(visits)
    .innerJoin(people, eq(visits.personId, people.id))
    .innerJoin(staff, eq(visits.staffId, staff.id))
    .innerJoin(serviceAgreements, eq(visits.serviceAgreementId, serviceAgreements.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(visits.clockInAt))
    .limit(f.limit ?? 200);
}

export async function getVisit(id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ visit: visits, person: people, staff: staff, agreement: serviceAgreements })
    .from(visits)
    .innerJoin(people, eq(visits.personId, people.id))
    .innerJoin(staff, eq(visits.staffId, staff.id))
    .innerJoin(serviceAgreements, eq(visits.serviceAgreementId, serviceAgreements.id))
    .where(eq(visits.id, id))
    .limit(1);
  if (!row) return null;
  const edits = await db
    .select({ edit: visitEdits, editorEmail: users.email })
    .from(visitEdits)
    .innerJoin(users, eq(visitEdits.editedBy, users.id))
    .where(eq(visitEdits.visitId, id))
    .orderBy(desc(visitEdits.editedAt));
  return { ...row, edits };
}

export async function getOpenVisitForStaff(staffId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ visit: visits, person: people, agreement: serviceAgreements })
    .from(visits)
    .innerJoin(people, eq(visits.personId, people.id))
    .innerJoin(serviceAgreements, eq(visits.serviceAgreementId, serviceAgreements.id))
    .where(and(eq(visits.staffId, staffId), eq(visits.status, "in_progress"), isNull(visits.clockOutAt)))
    .orderBy(desc(visits.clockInAt))
    .limit(1);
  return row ?? null;
}

export async function dashboardCounts(period: { start: Date; end: Date }) {
  const db = await getDb();
  const [[active], [intake], [open], [inPeriod], [manual]] = await Promise.all([
    db.select({ n: count() }).from(people).where(eq(people.status, "active")),
    db.select({ n: count() }).from(people).where(eq(people.status, "intake")),
    db.select({ n: count() }).from(visits).where(eq(visits.status, "in_progress")),
    db.select({ n: count(), units: sum(visits.units) }).from(visits).where(and(gte(visits.clockInAt, period.start), lte(visits.clockInAt, period.end), eq(visits.status, "completed"))),
    db.select({ n: count() }).from(visits).where(and(eq(visits.manualEntry, true), eq(visits.evvStatus, "pending"))),
  ]);
  const inPeriodAnd = (...more: Parameters<typeof and>) => and(eq(visits.status, "completed"), gte(visits.clockInAt, period.start), lte(visits.clockInAt, period.end), ...more);
  const [returned] = await db.select({ n: count() }).from(visits).where(inPeriodAnd(isNotNull(visits.returnedAt)));
  const [unsigned] = await db.select({ n: count() }).from(visits).where(inPeriodAnd(isNull(visits.clientSignedAt)));
  return { active: active.n, intake: intake.n, open: open.n, periodVisits: inPeriod.n, periodUnits: Number(inPeriod.units ?? 0), manualPending: manual.n, returned: returned.n, unsigned: unsigned.n };
}

export async function listAudit(limit = 200) {
  const db = await getDb();
  return db
    .select({ entry: auditLog, actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .orderBy(desc(auditLog.at))
    .limit(limit);
}

export async function listAuditForRecord(tableName: string, recordId: string) {
  const db = await getDb();
  return db
    .select({ entry: auditLog, actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .where(and(eq(auditLog.tableName, tableName), eq(auditLog.recordId, recordId)))
    .orderBy(desc(auditLog.at));
}

export async function listClientDocuments(personId: string) {
  const db = await getDb();
  return db
    .select({ doc: clientDocuments, uploaderEmail: users.email })
    .from(clientDocuments)
    .innerJoin(users, eq(clientDocuments.uploadedBy, users.id))
    .where(eq(clientDocuments.personId, personId))
    .orderBy(clientDocuments.category, desc(clientDocuments.effectiveOn), desc(clientDocuments.createdAt));
}

/** Office roles see everyone; caregivers see only people currently assigned to them. */
export async function canViewPerson(user: { role: string; staffId: string | null }, personId: string): Promise<boolean> {
  if (user.role !== "dsp") return true;
  if (!user.staffId) return false;
  const db = await getDb();
  const [row] = await db.select({ id: assignments.id }).from(assignments).where(and(eq(assignments.staffId, user.staffId), eq(assignments.personId, personId), eq(assignments.active, true))).limit(1);
  return Boolean(row);
}

/* ---------- owner view ---------- */

export interface PeriodLine {
  visitId: string;
  staffId: string;
  staffName: string;
  personId: string;
  personName: string;
  serviceCode: string;
  units: number;
  clockInAt: Date;
  clockOutAt: Date | null;
  minutes: number;
  unitRate: number;
  payRate: number;
  signed: boolean;
  manual: boolean;
  evvStatus: string;
}

/** Completed visits in a range with the numbers needed to price them: billable revenue and gross pay. */
export async function periodLines(from: Date, to: Date): Promise<PeriodLine[]> {
  const db = await getDb();
  const rows = await db
    .select({
      visitId: visits.id,
      staffId: visits.staffId,
      staffFirst: staff.firstName,
      staffLast: staff.lastName,
      personId: visits.personId,
      personFirst: people.firstName,
      personLast: people.lastName,
      serviceCode: visits.serviceCode,
      units: visits.units,
      clockInAt: visits.clockInAt,
      clockOutAt: visits.clockOutAt,
      unitRate: serviceAgreements.unitRate,
      payRate: staff.payRate,
      signed: visits.clientSignedAt,
      manual: visits.manualEntry,
      evvStatus: visits.evvStatus,
    })
    .from(visits)
    .innerJoin(staff, eq(visits.staffId, staff.id))
    .innerJoin(people, eq(visits.personId, people.id))
    .innerJoin(serviceAgreements, eq(visits.serviceAgreementId, serviceAgreements.id))
    .where(and(eq(visits.status, "completed"), gte(visits.clockInAt, from), lte(visits.clockInAt, to)));
  return rows.map((r) => ({
    visitId: r.visitId,
    staffId: r.staffId,
    staffName: `${r.staffFirst} ${r.staffLast}`,
    personId: r.personId,
    personName: `${r.personFirst} ${r.personLast}`,
    serviceCode: r.serviceCode,
    units: r.units,
    clockInAt: r.clockInAt,
    clockOutAt: r.clockOutAt,
    minutes: r.clockOutAt ? Math.round((r.clockOutAt.getTime() - r.clockInAt.getTime()) / 60000) : 0,
    unitRate: Number(r.unitRate),
    payRate: Number(r.payRate),
    signed: Boolean(r.signed),
    manual: r.manual,
    evvStatus: r.evvStatus,
  }));
}

/** Every agreement with units used, for the authorization health board. */
export async function listAgreementsWithUsage() {
  const db = await getDb();
  const used = db
    .select({ agreementId: visits.serviceAgreementId, used: sum(visits.units).as("used") })
    .from(visits)
    .where(eq(visits.status, "completed"))
    .groupBy(visits.serviceAgreementId)
    .as("used");
  return db
    .select({ agreement: serviceAgreements, personFirst: people.firstName, personLast: people.lastName, unitsUsed: sql<number>`coalesce(${used.used}, 0)::int` })
    .from(serviceAgreements)
    .innerJoin(people, eq(serviceAgreements.personId, people.id))
    .leftJoin(used, eq(used.agreementId, serviceAgreements.id))
    .orderBy(serviceAgreements.endDate);
}

export async function countOpenVisits() {
  const db = await getDb();
  return db.select({ visit: visits, personFirst: people.firstName, personLast: people.lastName, staffFirst: staff.firstName, staffLast: staff.lastName }).from(visits).innerJoin(people, eq(visits.personId, people.id)).innerJoin(staff, eq(visits.staffId, staff.id)).where(eq(visits.status, "in_progress"));
}

/* ---------- service record ---------- */

/** Everything the service-record panel needs for one visit. */
export async function getVisitRecord(id: string) {
  const base = await getVisit(id);
  if (!base) return null;
  const db = await getDb();
  const [questions, responses, meds, admins, program, approver, returnedByName] = await Promise.all([
    db.select({ q: goalQuestions, goal: goals }).from(goalQuestions).innerJoin(goals, eq(goalQuestions.goalId, goals.id)).where(and(eq(goals.personId, base.person.id), eq(goals.status, "active"), eq(goalQuestions.active, true))).orderBy(goals.createdAt, goalQuestions.sortOrder),
    db.select().from(goalResponses).where(eq(goalResponses.visitId, id)),
    db.select().from(medications).where(and(eq(medications.personId, base.person.id), eq(medications.active, true))).orderBy(medications.name),
    db.select().from(medicationAdministrations).where(and(eq(medicationAdministrations.personId, base.person.id), eq(medicationAdministrations.scheduledDate, base.visit.clockInAt.toISOString().slice(0, 10)))),
    base.visit.programId ? db.select().from(programs).where(eq(programs.id, base.visit.programId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    base.visit.approvedBy ? db.select({ email: users.email }).from(users).where(eq(users.id, base.visit.approvedBy)).limit(1).then((r) => r[0]?.email ?? null) : Promise.resolve(null),
    base.visit.returnedBy ? db.select({ name: sql<string>`coalesce(${staff.firstName} || ' ' || ${staff.lastName}, ${users.email})` }).from(users).leftJoin(staff, eq(users.staffId, staff.id)).where(eq(users.id, base.visit.returnedBy)).limit(1).then((r) => r[0]?.name ?? null) : Promise.resolve(null),
  ]);
  return { ...base, questions, responses, meds, admins, program, approverEmail: approver, returnedByName };
}

/* ---------- life plan ---------- */

export async function listGoalsWithStats(personId: string, from: Date, to: Date) {
  const db = await getDb();
  const gs = await db.select().from(goals).where(eq(goals.personId, personId)).orderBy(desc(goals.status), goals.createdAt);
  if (gs.length === 0) return [];
  const qs = await db.select().from(goalQuestions).where(sql`${goalQuestions.goalId} in ${gs.map((g) => g.id)}`).orderBy(goalQuestions.sortOrder);
  const rs = qs.length
    ? await db
        .select({ questionId: goalResponses.questionId, response: goalResponses.response, at: visits.clockInAt })
        .from(goalResponses)
        .innerJoin(visits, eq(goalResponses.visitId, visits.id))
        .where(and(sql`${goalResponses.questionId} in ${qs.map((q) => q.id)}`, gte(visits.clockInAt, from), lte(visits.clockInAt, to)))
    : [];
  return gs.map((g) => ({
    goal: g,
    questions: qs.filter((q) => q.goalId === g.id).map((q) => {
      const mine = rs.filter((r) => r.questionId === q.id);
      return { question: q, yes: mine.filter((r) => r.response === "yes").length, no: mine.filter((r) => r.response === "no").length, na: mine.filter((r) => r.response === "na").length };
    }),
  }));
}

/* ---------- scheduling ---------- */

export async function listShifts(from: Date, to: Date, f: { staffId?: string; personId?: string } = {}) {
  const db = await getDb();
  const where = [gte(shifts.startAt, from), lte(shifts.startAt, to), f.staffId ? eq(shifts.staffId, f.staffId) : undefined, f.personId ? eq(shifts.personId, f.personId) : undefined].filter(Boolean);
  return db
    .select({ shift: shifts, personFirst: people.firstName, personLast: people.lastName, staffFirst: staff.firstName, staffLast: staff.lastName, serviceCode: serviceAgreements.serviceCode, modifiers: serviceAgreements.modifiers })
    .from(shifts)
    .innerJoin(people, eq(shifts.personId, people.id))
    .innerJoin(staff, eq(shifts.staffId, staff.id))
    .innerJoin(serviceAgreements, eq(shifts.serviceAgreementId, serviceAgreements.id))
    .where(and(...where))
    .orderBy(shifts.startAt);
}

export async function getShift(id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ shift: shifts, person: people, staff, agreement: serviceAgreements })
    .from(shifts)
    .innerJoin(people, eq(shifts.personId, people.id))
    .innerJoin(staff, eq(shifts.staffId, staff.id))
    .innerJoin(serviceAgreements, eq(shifts.serviceAgreementId, serviceAgreements.id))
    .where(eq(shifts.id, id))
    .limit(1);
  if (!row) return null;
  const [visit] = await db.select().from(visits).where(eq(visits.shiftId, id)).limit(1);
  return { ...row, visit: visit ?? null };
}

/** The scheduled shift a clock-in most plausibly fulfils: same staff and person, starting within 2 hours of now. */
export async function findShiftForClockIn(staffId: string, personId: string, at: Date) {
  const db = await getDb();
  const lo = new Date(at.getTime() - 2 * 3_600_000), hi = new Date(at.getTime() + 2 * 3_600_000);
  const [row] = await db.select().from(shifts).where(and(eq(shifts.staffId, staffId), eq(shifts.personId, personId), eq(shifts.status, "scheduled"), gte(shifts.startAt, lo), lte(shifts.startAt, hi))).orderBy(shifts.startAt).limit(1);
  return row ?? null;
}

/* ---------- medications ---------- */

export async function listMedications(personId: string, activeOnly = false) {
  const db = await getDb();
  return db.select().from(medications).where(activeOnly ? and(eq(medications.personId, personId), eq(medications.active, true)) : eq(medications.personId, personId)).orderBy(desc(medications.active), medications.name);
}

export async function listMedAdmins(personId: string, fromDate: string, toDate: string) {
  const db = await getDb();
  return db.select().from(medicationAdministrations).where(and(eq(medicationAdministrations.personId, personId), gte(medicationAdministrations.scheduledDate, fromDate), lte(medicationAdministrations.scheduledDate, toDate)));
}

/* ---------- client feed ---------- */

export type FeedEvent =
  | { kind: "visit"; at: Date; id: string; staff: string; service: string; modifiers: string[]; units: number; minutes: number | null; status: string; note: string | null; interaction: string | null; skills: string[]; signed: boolean; staffSigned: boolean; approved: boolean; manual: boolean; goalYes: number; goalNo: number }
  | { kind: "med"; at: Date; id: string; name: string; dose: string; time: string; status: string; note: string | null; by: string | null }
  | { kind: "shift"; at: Date; id: string; staff: string; service: string; status: string }
  | { kind: "document"; at: Date; id: string; title: string; category: string; by: string }
  | { kind: "agreement"; at: Date; id: string; number: string; service: string; modifiers: string[]; units: number; status: string }
  | { kind: "goal"; at: Date; id: string; title: string; status: string };

/** Everything that happened to a person in a window, newest first. */
export async function personFeed(personId: string, from: Date, to: Date): Promise<FeedEvent[]> {
  const db = await getDb();
  const fromDate = from.toISOString().slice(0, 10), toDate = to.toISOString().slice(0, 10);
  const [vs, resp, meds, shs, docs, ags, gs] = await Promise.all([
    db.select({ v: visits, staffFirst: staff.firstName, staffLast: staff.lastName }).from(visits).innerJoin(staff, eq(visits.staffId, staff.id)).where(and(eq(visits.personId, personId), gte(visits.clockInAt, from), lte(visits.clockInAt, to))),
    db.select({ visitId: goalResponses.visitId, response: goalResponses.response }).from(goalResponses).innerJoin(visits, eq(goalResponses.visitId, visits.id)).where(and(eq(visits.personId, personId), gte(visits.clockInAt, from), lte(visits.clockInAt, to))),
    db.select({ a: medicationAdministrations, name: medications.name, dose: medications.dose, first: staff.firstName, last: staff.lastName }).from(medicationAdministrations).innerJoin(medications, eq(medicationAdministrations.medicationId, medications.id)).leftJoin(staff, eq(medicationAdministrations.staffId, staff.id)).where(and(eq(medicationAdministrations.personId, personId), gte(medicationAdministrations.scheduledDate, fromDate), lte(medicationAdministrations.scheduledDate, toDate))),
    db.select({ s: shifts, first: staff.firstName, last: staff.lastName, code: serviceAgreements.serviceCode, mods: serviceAgreements.modifiers }).from(shifts).innerJoin(staff, eq(shifts.staffId, staff.id)).innerJoin(serviceAgreements, eq(shifts.serviceAgreementId, serviceAgreements.id)).where(and(eq(shifts.personId, personId), gte(shifts.startAt, from), lte(shifts.startAt, to), sql`${shifts.status} in ('missed', 'cancelled')`)),
    db.select({ d: clientDocuments, by: users.email }).from(clientDocuments).innerJoin(users, eq(clientDocuments.uploadedBy, users.id)).where(and(eq(clientDocuments.personId, personId), gte(clientDocuments.createdAt, from), lte(clientDocuments.createdAt, to))),
    db.select().from(serviceAgreements).where(and(eq(serviceAgreements.personId, personId), gte(serviceAgreements.createdAt, from), lte(serviceAgreements.createdAt, to))),
    db.select().from(goals).where(and(eq(goals.personId, personId), gte(goals.createdAt, from), lte(goals.createdAt, to))),
  ]);
  const yes = new Map<string, number>(), no = new Map<string, number>();
  for (const r of resp) { if (r.response === "yes") yes.set(r.visitId, (yes.get(r.visitId) ?? 0) + 1); if (r.response === "no") no.set(r.visitId, (no.get(r.visitId) ?? 0) + 1); }
  const events: FeedEvent[] = [
    ...vs.map(({ v, staffFirst, staffLast }): FeedEvent => ({ kind: "visit", at: v.clockInAt, id: v.id, staff: `${staffFirst} ${staffLast}`, service: v.serviceCode, modifiers: v.modifiers, units: v.units, minutes: v.clockOutAt ? Math.round((v.clockOutAt.getTime() - v.clockInAt.getTime()) / 60000) : null, status: v.status, note: v.shiftNote, interaction: v.interactionLevel, skills: v.skills, signed: Boolean(v.clientSignedAt), staffSigned: Boolean(v.staffSignedAt), approved: Boolean(v.approvedAt), manual: v.manualEntry, goalYes: yes.get(v.id) ?? 0, goalNo: no.get(v.id) ?? 0 })),
    ...meds.map(({ a, name, dose, first, last }): FeedEvent => ({ kind: "med", at: a.givenAt ?? new Date(`${a.scheduledDate}T${a.scheduledTime}:00-05:00`), id: a.id, name, dose, time: a.scheduledTime, status: a.status, note: a.note, by: first ? `${first} ${last}` : null })),
    ...shs.map(({ s, first, last, code, mods }): FeedEvent => ({ kind: "shift", at: s.startAt, id: s.id, staff: `${first} ${last}`, service: code, status: s.status, ...(mods.length ? {} : {}) })),
    ...docs.map(({ d, by }): FeedEvent => ({ kind: "document", at: d.createdAt, id: d.id, title: d.title, category: d.category, by })),
    ...ags.map((a): FeedEvent => ({ kind: "agreement", at: a.createdAt, id: a.id, number: a.agreementNumber, service: a.serviceCode, modifiers: a.modifiers, units: a.authorizedUnits, status: a.status })),
    ...gs.map((g): FeedEvent => ({ kind: "goal", at: g.createdAt, id: g.id, title: g.title, status: g.status })),
  ];
  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Office review queue for the current pay period. */

export async function goalCountsForVisits(visitIds: string[]) {
  const db = await getDb();
  const rows = visitIds.length ? await db.select({ visitId: goalResponses.visitId, response: goalResponses.response }).from(goalResponses).where(sql`${goalResponses.visitId} in ${visitIds}`) : [];
  const map = new Map<string, { yes: number; no: number }>();
  for (const r of rows) { const m = map.get(r.visitId) ?? { yes: 0, no: 0 }; if (r.response === "yes") m.yes++; if (r.response === "no") m.no++; map.set(r.visitId, m); }
  return map;
}

/** Note saves for a person: who, when, and where. */
export async function countNotes(personId: string) {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(visits).where(and(eq(visits.personId, personId), sql`${visits.shiftNote} is not null`));
  return row?.n ?? 0;
}

export async function listNoteEvents(personId: string) {
  const db = await getDb();
  const rows = await db
    .select({ visitId: visits.id, visitAt: visits.clockInAt, savedAt: visits.noteSavedAt, lat: visits.noteSavedLat, lng: visits.noteSavedLng, by: sql<string | null>`coalesce(${staff.firstName} || ' ' || ${staff.lastName}, ${users.email})`, edits: sql<number>`(select count(*) from ${visitEdits} where ${visitEdits.visitId} = ${visits.id})::int` })
    .from(visits)
    .leftJoin(users, eq(visits.noteSavedBy, users.id))
    .leftJoin(staff, eq(users.staffId, staff.id))
    .where(and(eq(visits.personId, personId), sql`${visits.shiftNote} is not null`))
    .orderBy(desc(visits.noteSavedAt), desc(visits.clockInAt))
    .limit(300);
  return rows;
}

/* ---------- notes export ---------- */

/** Everything the printed service note needs beyond the visit row, fetched in a handful of queries for many visits at once. */
export async function notesDetailForVisits(personId: string, visitIds: string[], dates: string[]) {
  const db = await getDb();
  if (visitIds.length === 0) return { responses: new Map<string, { goal: string; prompt: string; response: string }[]>(), admins: new Map<string, { name: string; dose: string; time: string; status: string }[]>(), edits: new Map<string, number>(), approvers: new Map<string, string>() };
  const [resp, adm, ed, appr] = await Promise.all([
    db.select({ visitId: goalResponses.visitId, response: goalResponses.response, prompt: goalQuestions.prompt, sortOrder: goalQuestions.sortOrder, goal: goals.title })
      .from(goalResponses).innerJoin(goalQuestions, eq(goalResponses.questionId, goalQuestions.id)).innerJoin(goals, eq(goalQuestions.goalId, goals.id))
      .where(inArray(goalResponses.visitId, visitIds)).orderBy(goals.createdAt, goalQuestions.sortOrder),
    dates.length
      ? db.select({ date: medicationAdministrations.scheduledDate, time: medicationAdministrations.scheduledTime, status: medicationAdministrations.status, name: medications.name, dose: medications.dose })
          .from(medicationAdministrations).innerJoin(medications, eq(medicationAdministrations.medicationId, medications.id))
          .where(and(eq(medicationAdministrations.personId, personId), inArray(medicationAdministrations.scheduledDate, dates))).orderBy(medicationAdministrations.scheduledTime)
      : Promise.resolve([] as { date: string; time: string; status: string; name: string; dose: string }[]),
    db.select({ visitId: visitEdits.visitId, n: count() }).from(visitEdits).where(inArray(visitEdits.visitId, visitIds)).groupBy(visitEdits.visitId),
    db.select({ visitId: visits.id, name: sql<string>`coalesce(${staff.firstName} || ' ' || ${staff.lastName}, ${users.email})` })
      .from(visits).innerJoin(users, eq(visits.approvedBy, users.id)).leftJoin(staff, eq(users.staffId, staff.id)).where(inArray(visits.id, visitIds)),
  ]);
  const responses = new Map<string, { goal: string; prompt: string; response: string }[]>();
  for (const r of resp) responses.set(r.visitId, [...(responses.get(r.visitId) ?? []), { goal: r.goal, prompt: r.prompt, response: r.response }]);
  const admins = new Map<string, { name: string; dose: string; time: string; status: string }[]>();
  for (const a of adm) admins.set(a.date, [...(admins.get(a.date) ?? []), { name: a.name, dose: a.dose, time: a.time, status: a.status }]);
  return { responses, admins, edits: new Map(ed.map((e) => [e.visitId, e.n])), approvers: new Map(appr.map((a) => [a.visitId, a.name])) };
}
