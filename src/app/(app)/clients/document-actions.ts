"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { deleteFile, putFile } from "@/lib/storage";
import { clientDocumentSchema, fieldErrors, formToObject, type ActionState } from "@/lib/validation";

const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/plain": ".txt",
};

export async function uploadClientDocument(personId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = clientDocumentSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: { file: "Choose a file" } };
  const ext = ALLOWED[file.type] ?? (file.name.toLowerCase().endsWith(".pdf") ? ".pdf" : null);
  if (!ext) return { errors: { file: "Use a PDF, image, Word document, or text file" } };
  if (file.size > 25 * 1024 * 1024) return { errors: { file: "Files must be under 25 MB" } };

  const rel = `clients/${personId}/${randomUUID()}${ext}`;
  await putFile(rel, new Uint8Array(await file.arrayBuffer()), file.type || "application/pdf");

  const db = await getDb();
  await audited(db, { userId: user.id }).insert(schema.clientDocuments, {
    personId,
    ...parsed.data,
    fileName: file.name,
    filePath: rel,
    mimeType: file.type || "application/pdf",
    sizeBytes: file.size,
    uploadedBy: user.id,
  });
  revalidatePath(`/clients/${personId}`);
  return {};
}

export async function deleteClientDocument(id: string, personId: string): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [doc] = await db.select().from(schema.clientDocuments).where(eq(schema.clientDocuments.id, id)).limit(1);
  if (!doc) return;
  await audited(db, { userId: user.id }).delete(schema.clientDocuments, id);
  await deleteFile(doc.filePath);
  revalidatePath(`/clients/${personId}`);
}
