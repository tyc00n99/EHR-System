import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { canViewPerson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { getFile } from "@/lib/storage";

/** Serves a client's photo to people allowed to see that client, and nobody else. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!(await canViewPerson(user, id))) notFound();
  const db = await getDb();
  const [person] = await db.select({ photoPath: schema.people.photoPath }).from(schema.people).where(eq(schema.people.id, id)).limit(1);
  if (!person?.photoPath) notFound();
  const file = await getFile(person.photoPath);
  if (!file) notFound();
  return new Response(new Uint8Array(file.bytes) as unknown as BodyInit, {
    // A photo is PHI, so it is never cached by a shared proxy.
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300" },
  });
}
