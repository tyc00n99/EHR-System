import { notFound } from "next/navigation";
import { canViewPerson, getPerson, getVisit } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { buildNotesPdf } from "../../../clients/[id]/notes.pdf/build";

/** One note, rendered inline so it can be previewed in a frame. Reachable from any note list. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const record = await getVisit(id);
  if (!record) notFound();
  const person = await getPerson(record.visit.personId);
  if (!person || !(await canViewPerson(user, person.id))) notFound();
  const { buffer } = await buildNotesPdf(person, { visitId: id });
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store" },
  });
}
