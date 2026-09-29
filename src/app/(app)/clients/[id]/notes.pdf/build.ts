import { renderToBuffer } from "@react-pdf/renderer";
import { getOrganization, getPerson, listVisits, notesDetailForVisits } from "@/db/queries";
import type { Person } from "@/db/schema";
import { fromLocalInput } from "@/lib/format";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { NotesPdf, type PdfNote } from "./notes-pdf";
import type { TimesheetGroup } from "./timesheet-pdf";

const chicagoDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export interface NotesPdfFilter { code?: string | null; visitId?: string | null; from?: string | null; to?: string | null; staffId?: string | null }

/** Renders the notes document for one person. Shared by the client export and the single-note preview. */
export async function buildNotesPdf(person: Person, filter: NotesPdfFilter) {
  const { code = "", visitId = null, from = null, to = null, staffId = null } = filter;
  const rows = (await listVisits({ id: visitId || undefined, personId: person.id, staffId: staffId || undefined, from: from ? fromLocalInput(`${from}T00:00`) : undefined, to: to ? new Date(fromLocalInput(`${to}T00:00`).getTime() + 86_399_000) : undefined, limit: 2000 }))
    .filter((r) => (visitId ? r.visit.id === visitId : r.visit.status === "completed" && (!code || r.visit.serviceCode === code)));
  const [org, notes] = await Promise.all([getOrganization(), toPdfNotes(person.id, rows)]);
  registerPdfFonts();
  // A week or more of notes gets a service summary in front: one page per caregiver and service.
  const span = notes.length ? { start: notes[notes.length - 1].clockInAt, end: notes[0].clockInAt } : null;
  const rangeStart = from ? fromLocalInput(`${from}T00:00`) : span?.start;
  const rangeEnd = to ? fromLocalInput(`${to}T00:00`) : span?.end;
  const days = rangeStart && rangeEnd ? Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1 : 0;
  let summary: { groups: TimesheetGroup[]; from: Date; to: Date } | undefined;
  if (!visitId && days >= 7 && notes.length > 0 && rangeStart && rangeEnd) {
    const byGroup = new Map<string, TimesheetGroup>();
    for (const n of [...notes].reverse()) {
      const k = `${n.staff}|${n.serviceCode}|${n.modifiers.join(" ")}`;
      const g = byGroup.get(k) ?? { staff: n.staff, renderingIdType: n.renderingIdType, renderingId: n.renderingId, serviceCode: n.serviceCode, modifiers: n.modifiers, agreementNumber: n.agreementNumber, agreementStart: n.agreementStart, agreementEnd: n.agreementEnd, authorizedUnits: n.authorizedUnits, notes: [] };
      g.notes.push(n);
      byGroup.set(k, g);
    }
    summary = { groups: [...byGroup.values()], from: rangeStart, to: rangeEnd };
  }
  const buffer = await renderToBuffer(NotesPdf({ org, person, rows: notes, range: { from, to, code: code ?? "" }, summary }));
  return { buffer, notes };
}

type VisitRow = Awaited<ReturnType<typeof listVisits>>[number];

/** A person's visits with everything the printed note shows: outcomes, the day's MAR, edits, approver. */
async function toPdfNotes(personId: string, rows: VisitRow[]): Promise<PdfNote[]> {
  const detail = await notesDetailForVisits(personId, rows.map((r) => r.visit.id), [...new Set(rows.map((r) => chicagoDate(r.visit.clockInAt)))]);
  return rows.map((r) => ({
    ...r.visit,
    staff: `${r.staffFirst} ${r.staffLast}`,
    staffTitle: r.staffTitle ?? null,
    agreementNumber: r.agreementNumber,
    agreementStart: r.agreementStart,
    agreementEnd: r.agreementEnd,
    authorizedUnits: r.authorizedUnits,
    outcomes: detail.responses.get(r.visit.id) ?? [],
    meds: detail.admins.get(chicagoDate(r.visit.clockInAt)) ?? [],
    edits: detail.edits.get(r.visit.id) ?? 0,
    approvedByName: detail.approvers.get(r.visit.id) ?? null,
  }));
}

/**
 * The printed Daily Service Notes for any set of notes, across clients, in date order (Sept 29, 2026:
 * the Notes list's Export PDF was a table; the user wants the notes themselves). One page per note,
 * each naming its own client. No service summary: that is a per-client document.
 */
export async function buildNotesPdfForVisits(rows: VisitRow[]) {
  const done = rows.filter((r) => r.visit.status === "completed");
  const byPerson = new Map<string, VisitRow[]>();
  for (const r of done) byPerson.set(r.visit.personId, [...(byPerson.get(r.visit.personId) ?? []), r]);
  const [org, people] = await Promise.all([getOrganization(), Promise.all([...byPerson.keys()].map((id) => getPerson(id)))]);
  const personById = new Map(people.filter((p): p is Person => Boolean(p)).map((p) => [p.id, p]));
  const notes = (await Promise.all([...byPerson.entries()].map(async ([id, list]) => (await toPdfNotes(id, list)).map((n) => ({ ...n, person: personById.get(id) })))))
    .flat()
    .filter((n) => n.person)
    .sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  registerPdfFonts();
  const first = notes[0]?.person ?? people.find(Boolean);
  if (!first) return null;
  return renderToBuffer(NotesPdf({ org, person: first, rows: notes, range: { from: null, to: null, code: "" } }));
}
