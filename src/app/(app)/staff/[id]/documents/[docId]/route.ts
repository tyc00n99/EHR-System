import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getFile } from "@/lib/storage";

/**
 * Serves one staff document. Office roles can open any; a caregiver can open only their own file.
 * Nothing here is cacheable by a shared cache: an I-9 or a background study is personal data.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await requireUser();
  const { id, docId } = await params;
  if (user.role === "dsp" && user.staffId !== id) notFound();
  const db = await getDb();
  const [doc] = await db.select().from(schema.staffDocuments).where(and(eq(schema.staffDocuments.id, docId), eq(schema.staffDocuments.staffId, id))).limit(1);
  if (!doc) notFound();
  const file = await getFile(doc.filePath);
  if (!file) notFound();
  const inline = doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/");
  return new Response(new Uint8Array(file.bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
