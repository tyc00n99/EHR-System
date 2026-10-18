import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getClientProfile } from "@/db/profile-queries";
import {
  canViewPerson, getPerson, getStaff, getVisitRecord, listAgreementsForPerson, listAssignmentsForPerson, listAssignmentsForStaff, listClientDocuments,
  listCredentials, listDocumentTypes, listGoalsWithStats, listMedAdmins, listMedications, listPeople, listShifts, listStaffDocuments, listVisits, notesDetailForVisits,
} from "@/db/queries";
import { attentionItems } from "@/lib/attention";
import type { CurrentUser } from "@/lib/auth";
import { buildDocumentChecklist } from "@/lib/client-documents";
import { buildPersonnelFile, personnelSummary } from "@/lib/personnel-file";
import type { AssistantContext, AssistantDraft, AssistantSource, DraftKind } from "./types";

/**
 * The assistant's read-only window onto the record (Oct 18, 2026). Claude never touches the
 * database: it asks for one of these lookups, and each one re-checks the asking person's own
 * abilities before it reads anything — the same rules the screens apply. A caregiver's assistant
 * sees only assigned clients and never lists past notes (they could be pasted into a new one).
 *
 * Every record returned carries a `ref` the model cites, and the same ref is registered as a
 * source the UI turns into a link, so each claim can be traced to the record behind it.
 */

const TZ = "America/Chicago";
const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const when = (d: Date) => d.toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const short = (id: string) => id.replace(/-/g, "").slice(0, 8);
const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
/** A Chicago calendar date as an instant; close enough for day ranges (DST shifts it by an hour). */
const startOf = (iso: string) => new Date(`${iso}T00:00:00-05:00`);
const endOf = (iso: string) => new Date(`${iso}T23:59:59-05:00`);

export class Denied extends Error {}

export interface ToolScope {
  user: CurrentUser;
  context: AssistantContext;
  sources: Map<string, AssistantSource>;
  drafts: AssistantDraft[];
  /** Clients whose records were read, for the audit entry. */
  people: Set<string>;
  /** Ids the model may cite, mapped back to full ids. */
  ids: Map<string, string>;
}

function cite(scope: ToolScope, s: AssistantSource): string {
  scope.sources.set(s.ref, s);
  return s.ref;
}

function resolveId(scope: ToolScope, raw: string): string {
  const v = raw.trim().replace(/^\[|\]$/g, "").replace(/^[a-z]+:/, "");
  return scope.ids.get(v) ?? v;
}

function remember(scope: ToolScope, full: string) {
  scope.ids.set(short(full), full);
  return short(full);
}

const has = (u: CurrentUser, a: CurrentUser["abilities"][number]) => u.abilities.includes(a);

async function personFor(scope: ToolScope, rawId: string) {
  const id = resolveId(scope, rawId);
  if (!z.uuid().safeParse(id).success) throw new Denied("That is not a client id. Use find_clients first.");
  const person = await getPerson(id);
  if (!person || !(await canViewPerson(scope.user, id))) throw new Denied("This person is not on your caseload, so the record cannot be opened.");
  scope.people.add(id);
  return person;
}

function clientRef(scope: ToolScope, p: { id: string; firstName: string; lastName: string; pmi: string }) {
  return cite(scope, { ref: `client:${remember(scope, p.id)}`, kind: "client", label: `${p.firstName} ${p.lastName}`, detail: `PMI ${p.pmi}`, href: `/clients/${p.id}` });
}

/* ------------------------------------------------------------------------------------------------ */

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  /** Plain words for the panel while the lookup runs. */
  status: (input: z.infer<S>) => string;
  schema: S;
  json: Anthropic.Tool["input_schema"];
  allowed?: (u: CurrentUser) => boolean;
  run: (scope: ToolScope, input: z.infer<S>) => Promise<unknown>;
}

function tool<S extends z.ZodType>(t: ToolDef<S>) {
  return t;
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Anthropic.Tool["input_schema"] => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });

const findClients = tool({
  name: "find_clients",
  description: "Find clients on the asking person's caseload by name or PMI. Returns ids to pass to the other tools. Leave query empty to list everyone they can see.",
  status: (i) => (i.query ? `Looking up "${i.query}"` : "Listing the caseload"),
  schema: z.object({ query: z.string().max(80).optional() }),
  json: obj({ query: str("Part of a first or last name, or a PMI number") }),
  async run(scope, { query }) {
    const q = (query ?? "").trim().toLowerCase();
    const people = await listPeople();
    const visible: typeof people = [];
    for (const p of people) if (await canViewPerson(scope.user, p.id)) visible.push(p);
    const hits = visible.filter((p) => !q || `${p.firstName} ${p.lastName} ${p.preferredName ?? ""} ${p.pmi}`.toLowerCase().includes(q)).slice(0, 25);
    return { clients: hits.map((p) => ({ ref: clientRef(scope, p), id: short(p.id), name: `${p.firstName} ${p.lastName}`, status: p.status, waiver: p.waiverProgram })) };
  },
});

const clientOverview = tool({
  name: "get_client_overview",
  description: "One client's chart: status, waiver, county, case manager, authorizations with units used, care team, active outcomes, active medications and diagnoses.",
  status: () => "Reading the client's chart",
  schema: z.object({ client_id: z.string() }),
  json: obj({ client_id: str("Client id from find_clients or the page context") }, ["client_id"]),
  async run(scope, { client_id }) {
    const p = await personFor(scope, client_id);
    const [agreements, team, goals, meds, profile] = await Promise.all([
      listAgreementsForPerson(p.id), listAssignmentsForPerson(p.id), listGoalsWithStats(p.id, new Date(Date.now() - 90 * 86_400_000), new Date()), listMedications(p.id, true), getClientProfile(p.id),
    ]);
    const today = day(new Date());
    return {
      client: {
        ref: clientRef(scope, p), name: `${p.firstName} ${p.lastName}`, preferredName: p.preferredName, dob: p.dob, status: p.status, waiver: p.waiverProgram, county: p.county,
        serviceStart: p.serviceStartDate, caseManager: p.caseManagerName, guardian: p.guardianName ? `${p.guardianName} (${p.guardianRelationship ?? "guardian"})` : null,
        medicationSupport: p.medicationSupport, activityLibrary: p.activityLibrary,
      },
      authorizations: agreements.filter((a) => !a.agreement.archivedAt).map((a) => ({
        ref: cite(scope, { ref: `auth:${remember(scope, a.agreement.id)}`, kind: "auth", label: `Authorization ${a.agreement.agreementNumber}`, detail: `${a.agreement.serviceCode} ${a.agreement.modifiers.join(" ")}`, href: `/clients/${p.id}?tab=profile&section=authorizations` }),
        service: `${a.agreement.serviceCode} ${a.agreement.modifiers.join(" ")}`.trim(), status: a.agreement.status, from: a.agreement.startDate, through: a.agreement.endDate,
        unitsAuthorized: a.agreement.authorizedUnits, unitsUsed: a.unitsUsed, percentUsed: Math.round((a.unitsUsed / Math.max(1, a.agreement.authorizedUnits)) * 100), current: a.agreement.status === "active" && a.agreement.endDate >= today,
      })),
      careTeam: team.map((t) => ({ name: `${t.staff.firstName} ${t.staff.lastName}`, title: t.staff.title, orientedOn: t.assignment.orientedOn })),
      outcomes: goals.filter((g) => g.goal.status === "active").map((g) => ({
        ref: cite(scope, { ref: `goal:${remember(scope, g.goal.id)}`, kind: "goal", label: g.goal.title, detail: "Outcome", href: `/clients/${p.id}?tab=lifeplan` }),
        title: g.goal.title, outcome: clip(g.goal.outcome, 600), questions: g.questions.map((q) => q.question.prompt), latestReview: g.reviews[0] ? { assessment: g.reviews[0].assessment, on: day(g.reviews[0].reviewedAt) } : null,
      })),
      medications: meds.map((m) => ({ name: m.name, dose: m.dose, times: m.times, instructions: m.instructions })),
      diagnoses: profile.diagnoses.filter((d) => !d.archivedAt).map((d) => ({ code: d.icdCode, description: d.description, primary: d.isPrimary })),
      medicationRef: meds.length ? cite(scope, { ref: `mar:${short(p.id)}`, kind: "mar", label: `${p.firstName}'s MAR`, href: `/clients/${p.id}?tab=medical` }) : null,
    };
  },
});

const NoteRange = z.object({ client_id: z.string().optional(), staff_id: z.string().optional(), from: isoDate.optional(), to: isoDate.optional(), limit: z.number().int().min(1).max(60).optional() });
const noteRangeJson = obj({
  client_id: str("Client id, to limit to one person"), staff_id: str("Staff id, to limit to one caregiver"), from: str("First day, YYYY-MM-DD (default 30 days ago)"), to: str("Last day, YYYY-MM-DD (default today)"), limit: { type: "integer", description: "Most notes to return, newest first (default 30, max 60)" },
});

async function rangeOf(scope: ToolScope, i: z.infer<typeof NoteRange>) {
  const to = i.to ? endOf(i.to) : new Date();
  const from = i.from ? startOf(i.from) : new Date(to.getTime() - 30 * 86_400_000);
  const person = i.client_id ? await personFor(scope, i.client_id) : null;
  const staffId = i.staff_id ? resolveId(scope, i.staff_id) : undefined;
  if (staffId && !z.uuid().safeParse(staffId).success) throw new Denied("That is not a staff id.");
  return { from, to, person, staffId };
}

function noteRef(scope: ToolScope, v: { id: string; clockInAt: Date }, who: string) {
  return cite(scope, { ref: `note:${remember(scope, v.id)}`, kind: "note", label: `Note · ${who}`, detail: when(v.clockInAt), href: `?note=${v.id}` });
}

const listNotes = tool({
  name: "list_notes",
  description: "Service notes (visits) in a date range, newest first, with the progress review, incident note, signatures, review state and flags. For trends, summaries and gap checks across notes.",
  status: (i) => `Reading notes${i.from ? ` from ${i.from}` : ""}${i.to ? ` to ${i.to}` : ""}`,
  schema: NoteRange,
  json: noteRangeJson,
  allowed: (u) => has(u, "edit_visits"),
  async run(scope, i) {
    const { from, to, person, staffId } = await rangeOf(scope, i);
    const rows = await listVisits({ personId: person?.id, staffId, from, to, limit: i.limit ?? 30 });
    for (const r of rows) scope.people.add(r.visit.personId);
    return {
      range: { from: day(from), to: day(to) },
      count: rows.length,
      notes: rows.map(({ visit: v, personFirst, personLast, staffFirst, staffLast, editCount }) => ({
        ref: noteRef(scope, v, `${personFirst} ${personLast}`), client: `${personFirst} ${personLast}`, caregiver: `${staffFirst} ${staffLast}`, at: when(v.clockInAt),
        minutes: v.clockOutAt ? Math.round((v.clockOutAt.getTime() - v.clockInAt.getTime()) / 60000) : null, service: `${v.serviceCode} ${v.modifiers.join(" ")}`.trim(), units: v.units, status: v.status,
        interaction: v.interactionLevel, skills: v.skills, activities: v.activities, progressReview: clip(v.shiftNote, 1200), incident: v.incidentNote,
        caregiverSigned: Boolean(v.staffSignedAt), clientSigned: Boolean(v.clientSignedAt), clientUnsignedReason: v.clientUnsignedReason, returned: v.returnedAt ? v.returnReason ?? "returned" : null,
        manualEntry: v.manualEntry ? v.manualEntryReason ?? "yes" : null, edits: editCount,
      })),
    };
  },
});

const getNote = tool({
  name: "get_note",
  description: "One service note in full: times, service, everything the caregiver marked, outcomes addressed and question answers, the day's medication record, signatures and review state.",
  status: () => "Opening the note",
  schema: z.object({ note_id: z.string() }),
  json: obj({ note_id: str("Note id or ref") }, ["note_id"]),
  async run(scope, { note_id }) {
    const id = resolveId(scope, note_id);
    if (!z.uuid().safeParse(id).success) throw new Denied("That is not a note id.");
    const r = await getVisitRecord(id);
    if (!r) throw new Denied("Note not found.");
    // Caregivers can open the note they are working on; past notes stay out of reach.
    if (!has(scope.user, "edit_visits") && !(r.visit.staffId === scope.user.staffId && scope.context.visitId === id)) throw new Denied("Caregivers can only work with the note that is open.");
    if (!(await canViewPerson(scope.user, r.person.id))) throw new Denied("This person is not on your caseload.");
    scope.people.add(r.person.id);
    const detail = await notesDetailForVisits(r.person.id, [id], [day(r.visit.clockInAt)]);
    const v = r.visit;
    return {
      ref: noteRef(scope, v, `${r.person.firstName} ${r.person.lastName}`), client: `${r.person.firstName} ${r.person.lastName}`, caregiver: `${r.staff.firstName} ${r.staff.lastName}`,
      clockIn: when(v.clockInAt), clockOut: v.clockOutAt ? when(v.clockOutAt) : null, service: `${v.serviceCode} ${v.modifiers.join(" ")}`.trim(), program: r.program?.name ?? null, units: v.units, status: v.status,
      interaction: v.interactionLevel, skills: v.skills, activities: v.activities, tasks: v.tasks.filter((t) => t.completed).map((t) => t.label), progressReview: v.shiftNote, incident: v.incidentNote,
      outcomesAndAnswers: detail.responses.get(id) ?? [], medications: detail.admins.get(day(v.clockInAt)) ?? [],
      caregiverSigned: Boolean(v.staffSignedAt), clientSigned: Boolean(v.clientSignedAt), clientUnsignedReason: v.clientUnsignedReason, returned: v.returnedAt ? v.returnReason : null, manualEntry: v.manualEntry ? v.manualEntryReason : null, edits: r.edits.length,
    };
  },
});

const outcomeProgress = tool({
  name: "get_outcome_progress",
  description: "Progress on a client's support-plan outcomes over a window: each outcome's statement, how it is measured, yes/no answer tallies (this month against last), the progress log, and supervisor reviews.",
  status: (i) => `Reading outcome progress (${i.days ?? 90} days)`,
  schema: z.object({ client_id: z.string(), days: z.number().int().min(7).max(365).optional() }),
  json: obj({ client_id: str("Client id"), days: { type: "integer", description: "How far back to count, 7 to 365 (default 90)" } }, ["client_id"]),
  async run(scope, { client_id, days }) {
    const p = await personFor(scope, client_id);
    const window = days ?? 90;
    const from = new Date(Date.now() - window * 86_400_000);
    const goals = await listGoalsWithStats(p.id, from, new Date());
    const office = has(scope.user, "edit_visits");
    return {
      client: clientRef(scope, p), windowDays: window,
      outcomes: goals.map((g) => ({
        ref: cite(scope, { ref: `goal:${remember(scope, g.goal.id)}`, kind: "goal", label: g.goal.title, detail: "Outcome", href: `/clients/${p.id}?tab=lifeplan` }),
        title: g.goal.title, status: g.goal.status, outcome: clip(g.goal.outcome, 900), supports: clip(g.goal.supports, 600), measurement: clip(g.goal.measurement, 400), started: g.goal.startDate, target: g.goal.targetDate,
        questions: g.questions.map((q) => ({ prompt: q.question.prompt, yes: q.yes, no: q.no, notApplicable: q.na, last30Days: q.thisMonth, prior30Days: q.lastMonth })),
        reviews: g.reviews.slice(0, 4).map((r) => ({ on: day(r.reviewedAt), assessment: r.assessment, note: clip(r.note, 300), by: r.by })),
        // The log under an outcome holds other caregivers' lines; only reviewers read them.
        logInWindow: g.entries.filter((e) => e.at >= from).length,
        recentLog: office ? g.entries.filter((e) => e.at >= from).slice(0, 8).map((e) => ({ on: day(e.at), by: e.by, line: clip(e.body, 240), note: e.visitId ? noteRef(scope, { id: e.visitId, clockInAt: e.at }, `${p.firstName} ${p.lastName}`) : null })) : undefined,
      })),
    };
  },
});

const medicationRecord = tool({
  name: "get_medication_record",
  description: "A client's medication administration record (MAR) between two dates: per medication how many doses were given, refused, held or missed, and every exception with its note.",
  status: () => "Reading the medication record",
  schema: z.object({ client_id: z.string(), from: isoDate.optional(), to: isoDate.optional() }),
  json: obj({ client_id: str("Client id"), from: str("YYYY-MM-DD (default 30 days ago)"), to: str("YYYY-MM-DD (default today)") }, ["client_id"]),
  async run(scope, i) {
    const p = await personFor(scope, i.client_id);
    const to = i.to ?? day(new Date());
    const from = i.from ?? day(new Date(Date.now() - 30 * 86_400_000));
    const [meds, admins] = await Promise.all([listMedications(p.id), listMedAdmins(p.id, from, to)]);
    const ref = cite(scope, { ref: `mar:${short(p.id)}`, kind: "mar", label: `${p.firstName}'s MAR`, detail: `${from} to ${to}`, href: `/clients/${p.id}?tab=medical` });
    return {
      ref, medicationSupport: p.medicationSupport, range: { from, to },
      medications: meds.map((m) => {
        const mine = admins.filter((a) => a.medicationId === m.id);
        const n = (s: string) => mine.filter((a) => a.status === s).length;
        return { name: m.name, dose: m.dose, times: m.times, active: m.active, given: n("given"), refused: n("refused"), held: n("held"), missed: n("missed") };
      }),
      exceptions: admins.filter((a) => a.status !== "given").slice(0, 40).map((a) => ({ medication: meds.find((m) => m.id === a.medicationId)?.name, date: a.scheduledDate, time: a.scheduledTime, status: a.status, note: a.note, by: a.byName })),
    };
  },
});

const documentationGaps = tool({
  name: "get_documentation_gaps",
  description: "Documentation problems a manager should act on, for one client or the whole agency in a date range: notes with no progress review, missing signatures, returned notes, manual entries without evidence, notes that address no outcome, visits never clocked out, required client documents missing or overdue, and authorizations running low or ending.",
  status: () => "Checking for documentation gaps",
  schema: NoteRange,
  json: noteRangeJson,
  allowed: (u) => has(u, "edit_visits") || has(u, "review"),
  async run(scope, i) {
    const { from, to, person, staffId } = await rangeOf(scope, i);
    const rows = await listVisits({ personId: person?.id, staffId, from, to, limit: 500 });
    const ids = rows.map((r) => r.visit.id);
    const db = await getDb();
    const addressed = ids.length ? new Set((await db.select({ v: schema.goalEntries.visitId }).from(schema.goalEntries).where(inArray(schema.goalEntries.visitId, ids))).map((r) => r.v)) : new Set<string | null>();
    const answered = ids.length ? new Set((await db.select({ v: schema.goalResponses.visitId }).from(schema.goalResponses).where(inArray(schema.goalResponses.visitId, ids))).map((r) => r.v)) : new Set<string>();
    const gaps: { problem: string; note: string; client: string; caregiver: string; at: string }[] = [];
    for (const { visit: v, personFirst, personLast, staffFirst, staffLast } of rows) {
      scope.people.add(v.personId);
      const who = `${personFirst} ${personLast}`;
      const add = (problem: string) => gaps.push({ problem, note: noteRef(scope, v, who), client: who, caregiver: `${staffFirst} ${staffLast}`, at: when(v.clockInAt) });
      if (v.status === "in_progress" && Date.now() - v.clockInAt.getTime() > 12 * 3_600_000) add("Still clocked in after 12 hours; probably a missed clock-out");
      if (v.status !== "completed") continue;
      if (!v.shiftNote?.trim()) add("No progress review written");
      else if (v.shiftNote.trim().length < 80) add("Progress review is very short");
      if (!v.staffSignedAt) add("Caregiver has not signed");
      if (!v.clientSignedAt && !v.clientUnsignedReason) add("No client signature and no reason recorded");
      if (v.returnedAt) add(`Returned for correction: ${v.returnReason ?? ""}`.trim());
      if (v.manualEntry && !v.manualEvidenceAt) add("Manual entry without evidence on file");
      if (!addressed.has(v.id) && !answered.has(v.id)) add("Addresses no support-plan outcome");
    }
    const result: Record<string, unknown> = { range: { from: day(from), to: day(to) }, notesChecked: rows.length, noteGaps: gaps.slice(0, 80), more: Math.max(0, gaps.length - 80) };
    if (person) {
      const [docs, types, agreements] = await Promise.all([listClientDocuments(person.id), listDocumentTypes(), listAgreementsForPerson(person.id)]);
      const docRef = cite(scope, { ref: `doc:${short(person.id)}`, kind: "doc", label: `${person.firstName}'s documents`, href: `/clients/${person.id}?tab=files` });
      result.requiredDocuments = buildDocumentChecklist(docs.map((d) => d.doc).filter((d) => !d.archivedAt), types).filter((c) => c.status !== "ok").map((c) => ({ ref: docRef, document: c.type.label, status: c.status, renewBy: c.renewBy }));
      const today = day(new Date()), in60 = day(new Date(Date.now() + 60 * 86_400_000));
      result.authorizations = agreements.filter((a) => a.agreement.status === "active" && !a.agreement.archivedAt && a.agreement.endDate >= today).map((a) => ({ a, pct: Math.round((a.unitsUsed / Math.max(1, a.agreement.authorizedUnits)) * 100) })).filter(({ a, pct }) => pct >= 75 || a.agreement.endDate <= in60).map(({ a, pct }) => ({
        ref: cite(scope, { ref: `auth:${remember(scope, a.agreement.id)}`, kind: "auth", label: `Authorization ${a.agreement.agreementNumber}`, href: `/clients/${person.id}?tab=profile&section=authorizations` }),
        service: a.agreement.serviceCode, percentUsed: pct, through: a.agreement.endDate,
      }));
    }
    return result;
  },
});

const reviewQueue = tool({
  name: "get_review_queue",
  description: "The agency's review queue: everything an office user should act on now (unsigned and returned notes, manual entries, compliance items, missing or rotated signing codes, authorizations, open visits, missed shifts), most urgent first.",
  status: () => "Reading the review queue",
  schema: z.object({}),
  json: obj({}),
  allowed: (u) => has(u, "review"),
  async run(scope) {
    const items = await attentionItems();
    return {
      total: items.length,
      byKind: Object.fromEntries([...new Set(items.map((i) => i.kind))].map((k) => [k, items.filter((i) => i.kind === k).length])),
      items: items.slice(0, 60).map((it, n) => ({ ref: cite(scope, { ref: `queue:${n + 1}`, kind: "queue", label: it.title, detail: it.detail, href: it.href }), kind: it.kind, severity: it.severity, title: it.title, detail: it.detail })),
    };
  },
});

const staffOverview = tool({
  name: "get_staff_overview",
  description: "One staff member: job, hire date, personnel-file status (each licensor item and what is open), clients assigned and whether oriented, and their documentation over the last 30 days.",
  status: () => "Reading the staff record",
  schema: z.object({ staff_id: z.string() }),
  json: obj({ staff_id: str("Staff id") }, ["staff_id"]),
  allowed: (u) => has(u, "view_team"),
  async run(scope, { staff_id }) {
    const id = resolveId(scope, staff_id);
    if (!z.uuid().safeParse(id).success) throw new Denied("That is not a staff id.");
    const s = await getStaff(id);
    if (!s) throw new Denied("Staff member not found.");
    const [creds, docs, assigned, notes] = await Promise.all([listCredentials(id), listStaffDocuments(id), listAssignmentsForStaff(id), listVisits({ staffId: id, from: new Date(Date.now() - 30 * 86_400_000), limit: 300 })]);
    const file = buildPersonnelFile(s.hireDate, creds, docs);
    const done = notes.filter((n) => n.visit.status === "completed");
    return {
      ref: cite(scope, { ref: `staff:${remember(scope, id)}`, kind: "staff", label: `${s.firstName} ${s.lastName}`, detail: s.title, href: `/staff/${id}` }),
      name: `${s.firstName} ${s.lastName}`, title: s.title, hired: s.hireDate, active: s.active,
      personnelFile: { ...personnelSummary(file), open: file.filter((f) => f.required && f.status !== "ok" && f.status !== "due_soon").map((f) => ({ item: f.label, status: f.status, due: f.due, detail: f.detail })), dueSoon: file.filter((f) => f.status === "due_soon").map((f) => ({ item: f.label, due: f.due })) },
      clients: assigned.filter((a) => a.assignment.active).map((a) => ({ name: `${a.person.firstName} ${a.person.lastName}`, orientedOn: a.assignment.orientedOn })),
      last30Days: { notes: done.length, noProgressReview: done.filter((n) => !n.visit.shiftNote?.trim()).length, clientUnsigned: done.filter((n) => !n.visit.clientSignedAt).length, returned: done.filter((n) => n.visit.returnedAt).length, manual: done.filter((n) => n.visit.manualEntry).length },
    };
  },
});

const schedule = tool({
  name: "get_schedule",
  description: "Scheduled shifts between two dates with client, caregiver, service and status (scheduled, in progress, completed, missed, cancelled). Caregivers see only their own.",
  status: () => "Reading the schedule",
  schema: z.object({ from: isoDate.optional(), to: isoDate.optional(), client_id: z.string().optional(), staff_id: z.string().optional() }),
  json: obj({ from: str("YYYY-MM-DD (default today)"), to: str("YYYY-MM-DD (default 7 days on)"), client_id: str("Client id"), staff_id: str("Staff id") }),
  async run(scope, i) {
    const from = i.from ? startOf(i.from) : startOf(day(new Date()));
    const to = i.to ? endOf(i.to) : new Date(from.getTime() + 7 * 86_400_000);
    const person = i.client_id ? await personFor(scope, i.client_id) : null;
    const staffId = has(scope.user, "schedule") || has(scope.user, "all_clients") ? (i.staff_id ? resolveId(scope, i.staff_id) : undefined) : scope.user.staffId ?? "00000000-0000-0000-0000-000000000000";
    const rows = await listShifts(from, to, { personId: person?.id, staffId });
    cite(scope, { ref: "schedule:week", kind: "schedule", label: "Schedule", href: has(scope.user, "schedule") ? "/scheduling" : "/" });
    return { ref: "schedule:week", shifts: rows.slice(0, 80).map((r) => ({ client: `${r.personFirst} ${r.personLast}`, caregiver: `${r.staffFirst} ${r.staffLast}`, start: when(r.shift.startAt), end: when(r.shift.endAt), service: r.serviceCode, status: r.shift.status })) };
  },
});

const DRAFT_KINDS = ["progress_review", "progress_summary", "incident_report", "message", "other"] as const satisfies readonly DraftKind[];

const proposeDraft = tool({
  name: "propose_draft",
  description: "Show the user a draft to review: a progress review for a note, a progress summary, an incident report, a message, or other documentation. The draft is NOT saved; the user edits and approves it. Put every fact you could not find in `missing` instead of inventing it, and list the refs the draft rests on.",
  status: (i) => `Preparing the ${i.kind.replace("_", " ")}`,
  schema: z.object({ kind: z.enum(DRAFT_KINDS), title: z.string().min(1).max(160), body: z.string().min(1).max(12000), client_id: z.string().optional(), note_id: z.string().optional(), missing: z.array(z.string().max(200)).max(20).optional(), source_refs: z.array(z.string()).max(60).optional() }),
  json: obj({
    kind: { type: "string", enum: DRAFT_KINDS, description: "progress_review for the open note's progress review; progress_summary and incident_report for reports" },
    title: str("Short title, e.g. 'Progress summary · Kevin Nguyen · Jul–Sep 2026'"),
    body: str("The full draft in plain text. Paragraphs separated by blank lines; short headings on their own line are fine for reports. For a progress_review: one paragraph, past tense, objective."),
    client_id: str("Client the draft is about"),
    note_id: str("The note a progress_review belongs to"),
    missing: { type: "array", items: { type: "string" }, description: "Details the draft needs that are not in the record (e.g. 'Time the fall happened')" },
    source_refs: { type: "array", items: { type: "string" }, description: "Refs of the records used, e.g. note:3f2a91bc" },
  }, ["kind", "title", "body"]),
  async run(scope, i) {
    let personId: string | undefined;
    if (i.client_id) personId = (await personFor(scope, i.client_id)).id;
    else if (scope.context.personId && (await canViewPerson(scope.user, scope.context.personId))) personId = scope.context.personId;
    const visitId = i.kind === "progress_review" ? (i.note_id ? resolveId(scope, i.note_id) : scope.context.visitId) : undefined;
    const draft: AssistantDraft = {
      id: crypto.randomUUID(), kind: i.kind, title: i.title, body: i.body.trim(), personId, visitId: visitId && z.uuid().safeParse(visitId).success ? visitId : undefined,
      missing: i.missing ?? [], sources: (i.source_refs ?? []).map((r) => r.replace(/^\[|\]$/g, "")).filter((r) => scope.sources.has(r)),
    };
    scope.drafts.push(draft);
    return { shown: true, note: "The draft is on the user's screen for review. It is not saved. Do not repeat its text; say in a sentence or two what it covers and what is still missing." };
  },
});

const ALL = [findClients, clientOverview, listNotes, getNote, outcomeProgress, medicationRecord, documentationGaps, reviewQueue, staffOverview, schedule, proposeDraft];
type AnyTool = ToolDef<z.ZodType>;

/** The tools this person may use, as the API expects them. Tools they lack are not offered at all. */
export function toolsFor(user: CurrentUser): { defs: Anthropic.Tool[]; byName: Map<string, AnyTool> } {
  const mine = (ALL as unknown as AnyTool[]).filter((t) => !t.allowed || t.allowed(user));
  return {
    defs: mine.map((t) => ({ name: t.name, description: t.description, input_schema: t.json, strict: true })),
    byName: new Map(mine.map((t) => [t.name, t])),
  };
}

/** Runs one tool call. Errors become a sentence the model can relay; nothing throws past here. */
export async function runTool(scope: ToolScope, t: AnyTool, input: unknown): Promise<{ ok: boolean; content: string; status: string }> {
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, content: `Invalid input: ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`, status: t.name };
  const status = t.status(parsed.data);
  if (t.allowed && !t.allowed(scope.user)) return { ok: false, content: "Not permitted for this user.", status };
  try {
    return { ok: true, content: JSON.stringify(await t.run(scope, parsed.data)), status };
  } catch (e) {
    if (e instanceof Denied) return { ok: false, content: e.message, status };
    console.error("assistant tool failed", t.name, e instanceof Error ? e.message : "error");
    return { ok: false, content: "That lookup failed. Tell the user it could not be read right now.", status };
  }
}

/** A short description of the page the person is on, resolved under their permissions. */
export async function describeContext(scope: ToolScope): Promise<string> {
  const c = scope.context;
  const lines: string[] = [];
  if (c.personId && z.uuid().safeParse(c.personId).success && (await canViewPerson(scope.user, c.personId))) {
    const p = await getPerson(c.personId);
    if (p) lines.push(`They are on the record of client ${p.firstName} ${p.lastName} (client_id ${remember(scope, p.id)}, ref ${clientRef(scope, p)}).`);
  }
  if (c.staffId && z.uuid().safeParse(c.staffId).success && has(scope.user, "view_team")) {
    const s = await getStaff(c.staffId);
    if (s) lines.push(`They are on the staff record of ${s.firstName} ${s.lastName} (staff_id ${remember(scope, s.id)}).`);
  }
  if (c.visitId && z.uuid().safeParse(c.visitId).success) {
    const db = await getDb();
    const [v] = await db.select({ id: schema.visits.id, personId: schema.visits.personId, staffId: schema.visits.staffId, at: schema.visits.clockInAt }).from(schema.visits).where(eq(schema.visits.id, c.visitId)).limit(1);
    const mine = v && (has(scope.user, "edit_visits") || v.staffId === scope.user.staffId);
    if (v && mine && (await canViewPerson(scope.user, v.personId))) {
      const p = await getPerson(v.personId);
      lines.push(`They have the service record of a note open: note_id ${remember(scope, v.id)}, ${p ? `${p.firstName} ${p.lastName}, ` : ""}${when(v.at)}. A progress_review draft for it can be placed straight into the note's Progress review field once they approve it.`);
      if (p) clientRef(scope, p);
      if (c.noteDraft) {
        const d = c.noteDraft;
        lines.push(`What they have marked on this note so far (unsaved, from the form):\n${JSON.stringify({ interactionLevel: d.interactionLevel ?? null, skills: d.skills, activities: d.activities, tasksCompleted: d.tasks, outcomesAddressed: d.outcomes, goalAnswers: d.goalAnswers, progressReviewAsWritten: d.text || null })}`);
      }
    } else {
      scope.context.visitId = undefined;
    }
  }
  if (!lines.length && c.path) lines.push(`They are on ${c.path}.`);
  return lines.join("\n");
}
