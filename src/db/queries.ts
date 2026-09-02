import "server-only";
import { and, count, desc, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { getDb, schema } from "./index";

const { people, staff, sites, programs, serviceAgreements, visits, visitEdits, auditLog, users, organizations, assignments, staffCredentials, clientDocuments } = schema;

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
      editCount: sql<number>`(select count(*) from ${visitEdits} where ${visitEdits.visitId} = ${visits.id})::int`,
    })
    .from(visits)
    .innerJoin(people, eq(visits.personId, people.id))
    .innerJoin(staff, eq(visits.staffId, staff.id))
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
  return { active: active.n, intake: intake.n, open: open.n, periodVisits: inPeriod.n, periodUnits: Number(inPeriod.units ?? 0), manualPending: manual.n };
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
  minutes: number;
  unitRate: number;
  payRate: number;
  signed: boolean;
  manual: boolean;
  evvStatus: string;
}

/** Completed visits in a range with the numbers needed to price them: billable revenue and labor cost. */
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
