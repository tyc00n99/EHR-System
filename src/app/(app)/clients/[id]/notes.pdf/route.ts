import { notFound } from "next/navigation";
import { renderToBuffer } from "@react-pdf/renderer";
import { canViewPerson, getOrganization, getPerson, listVisits, notesDetailForVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fromLocalInput } from "@/lib/format";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { NotesPdf, type PdfNote } from "./notes-pdf";

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
  const buffer = await renderToBuffer(NotesPdf({ org, person, rows: notes, range: { from, to, code } }));
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="service-notes-${person.lastName}-${person.firstName}${from ? `-${from}` : ""}${to ? `-${to}` : ""}.pdf"` } });
}
