import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { canViewPerson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await requireUser();
  const { id, docId } = await params;
  if (!(await canViewPerson(user, id))) notFound();
  const db = await getDb();
  const [doc] = await db.select().from(schema.clientDocuments).where(and(eq(schema.clientDocuments.id, docId), eq(schema.clientDocuments.personId, id))).limit(1);
  if (!doc) notFound();
  const file = await readFile(path.join(UPLOAD_DIR, doc.filePath));
  const inline = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": doc.mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.fileName.replace(/"/g, "")}"`, "Cache-Control": "private, no-store" },
  });
}
