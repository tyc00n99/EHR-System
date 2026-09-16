import { notFound } from "next/navigation";
import { canViewPerson, getPerson, getVisit } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { cachedPdf, contentKey, rememberPdf } from "@/lib/pdf-cache";
import { buildNotesPdf } from "../../../clients/[id]/notes.pdf/build";

/** One note, rendered inline so it can be previewed in a frame. Reachable from any note list. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const record = await getVisit(id);
  if (!record) notFound();
  const person = await getPerson(record.visit.personId);
  if (!person || !(await canViewPerson(user, person.id))) notFound();
  // The key changes with the note itself, so a fresh edit or signature renders anew.
  const key = contentKey([id, record.visit, person.firstName, person.lastName]);
  let buffer = cachedPdf(key);
  if (!buffer) { buffer = (await buildNotesPdf(person, { visitId: id })).buffer; rememberPdf(key, buffer); }
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store" },
  });
}
