import { notFound } from "next/navigation";
import { renderToBuffer } from "@react-pdf/renderer";
import { canViewPerson, getOrganization, getPerson, listVisits, notesDetailForVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fromLocalInput } from "@/lib/format";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { NotesPdf, type PdfNote } from "./notes-pdf";
import type { TimesheetGroup } from "./timesheet-pdf";

const chicagoDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const person = await getPerson(id);
  if (!person || !(await canViewPerson(user, id))) notFound();
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const from = sp.get("from"), to = sp.get("to");
  const rows = (await listVisits({ personId: id, from: from ? fromLocalInput(`${from}T00:00`) : undefined, to: to ? new Date(fromLocalInput(`${to}T00:00`).getTime() + 86_399_000) : undefined, limit: 2000 }))
    .filter((r) => r.visit.status === "completed" && (!code || r.visit.serviceCode === code));
  const [org, detail] = await Promise.all([
    getOrganization(),
    notesDetailForVisits(id, rows.map((r) => r.visit.id), [...new Set(rows.map((r) => chicagoDate(r.visit.clockInAt)))]),
  ]);
  const notes: PdfNote[] = rows.map((r) => ({
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
  registerPdfFonts();
  // A week or more of notes gets a service summary in front: one page per caregiver and service.
  const span = notes.length ? { start: notes[notes.length - 1].clockInAt, end: notes[0].clockInAt } : null;
  const rangeStart = from ? fromLocalInput(`${from}T00:00`) : span?.start;
  const rangeEnd = to ? fromLocalInput(`${to}T00:00`) : span?.end;
  const days = rangeStart && rangeEnd ? Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1 : 0;
  let summary: { groups: TimesheetGroup[]; from: Date; to: Date } | undefined;
  if (days >= 7 && notes.length > 0 && rangeStart && rangeEnd) {
    const byGroup = new Map<string, TimesheetGroup>();
    for (const n of [...notes].reverse()) {
      const k = `${n.staff}|${n.serviceCode}|${n.modifiers.join(" ")}`;
      const g = byGroup.get(k) ?? { staff: n.staff, renderingIdType: n.renderingIdType, renderingId: n.renderingId, serviceCode: n.serviceCode, modifiers: n.modifiers, agreementNumber: n.agreementNumber, agreementStart: n.agreementStart, agreementEnd: n.agreementEnd, authorizedUnits: n.authorizedUnits, notes: [] };
      g.notes.push(n);
      byGroup.set(k, g);
    }
    summary = { groups: [...byGroup.values()], from: rangeStart, to: rangeEnd };
  }
  const buffer = await renderToBuffer(NotesPdf({ org, person, rows: notes, range: { from, to, code }, summary }));
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="service-notes-${person.lastName}-${person.firstName}${from ? `-${from}` : ""}${to ? `-${to}` : ""}.pdf"` } });
}
