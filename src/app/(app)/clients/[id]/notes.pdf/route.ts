import { notFound } from "next/navigation";
import { canViewPerson, getPerson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { buildNotesPdf } from "./build";

const chicagoDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const person = await getPerson(id);
  if (!person || !(await canViewPerson(user, id))) notFound();
  const sp = new URL(req.url).searchParams;
  const visitId = sp.get("visit");
  const from = sp.get("from"), to = sp.get("to");
  const { buffer, notes } = await buildNotesPdf(person, { code: sp.get("code"), visitId, from, to });
  const stamp = visitId && notes[0] ? `-${chicagoDate(notes[0].clockInAt)}` : `${from ? `-${from}` : ""}${to ? `-${to}` : ""}`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="service-note${visitId ? "" : "s"}-${person.lastName}-${person.firstName}${stamp}.pdf"`,
    },
  });
}
