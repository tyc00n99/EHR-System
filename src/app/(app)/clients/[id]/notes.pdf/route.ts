import { notFound } from "next/navigation";
import { canViewPerson, getPerson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { buildNotesPdf } from "./build";

import { pdfDisposition } from "@/lib/pdf-names";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const person = await getPerson(id);
  if (!person || !(await canViewPerson(user, id))) notFound();
  const sp = new URL(req.url).searchParams;
  const visitId = sp.get("visit");
  const from = sp.get("from"), to = sp.get("to");
  const { buffer, name } = await buildNotesPdf(person, { code: sp.get("code"), visitId, from, to, staffId: /^[0-9a-f-]{36}$/.test(sp.get("staff") ?? "") ? sp.get("staff") : null });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition("attachment", name),
    },
  });
}
