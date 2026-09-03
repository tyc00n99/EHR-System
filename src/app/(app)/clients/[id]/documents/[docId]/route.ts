import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { canViewPerson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { getFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await requireUser();
  const { id, docId } = await params;
  if (!(await canViewPerson(user, id))) notFound();
  const db = await getDb();
  const [doc] = await db.select().from(schema.clientDocuments).where(and(eq(schema.clientDocuments.id, docId), eq(schema.clientDocuments.personId, id))).limit(1);
  if (!doc) notFound();
  const file = await getFile(doc.filePath);
  if (!file) notFound();
  const inline = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
  return new Response(new Uint8Array(file.bytes) as unknown as BodyInit, {
    headers: { "Content-Type": doc.mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.fileName.replace(/"/g, "")}"`, "Cache-Control": "private, no-store" },
  });
}
