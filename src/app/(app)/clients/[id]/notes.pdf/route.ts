import { notFound } from "next/navigation";
import { renderToBuffer } from "@react-pdf/renderer";
import { canViewPerson, getOrganization, getPerson, listVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fromLocalInput } from "@/lib/format";
import { NotesPdf } from "./notes-pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const person = await getPerson(id);
  if (!person || !(await canViewPerson(user, id))) notFound();
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code") ?? "";
  const from = sp.get("from"), to = sp.get("to");
  const rows = (await listVisits({ personId: id, from: from ? fromLocalInput(`${from}T00:00`) : undefined, to: to ? new Date(fromLocalInput(`${to}T00:00`).getTime() + 86_399_000) : undefined, limit: 2000 })).filter((r) => r.visit.status === "completed" && (!code || r.visit.serviceCode === code));
  const org = await getOrganization();
  const buffer = await renderToBuffer(NotesPdf({ org: org.name, person, rows: rows.map((r) => ({ ...r.visit, staff: `${r.staffFirst} ${r.staffLast}` })), range: { from, to, code } }));
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="notes-${person.lastName}-${person.firstName}${from ? `-${from}` : ""}${to ? `-${to}` : ""}.pdf"` } });
}
