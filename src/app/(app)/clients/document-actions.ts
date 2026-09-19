"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { indexStoredDocument, textLayerFor } from "@/lib/document-text";
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

  const db = await getDb();
  const [type] = await db.select().from(schema.documentTypes).where(eq(schema.documentTypes.id, parsed.data.documentTypeId)).limit(1);
  if (!type || !type.active) return { errors: { documentTypeId: "Choose a type" } };
  // The legacy bucket follows the type for the seeded kinds; agency-defined kinds fall under "other".
  const LEGACY = ["support_plan", "iapp", "treatment_goals", "rights", "release", "medical", "other"] as const;
  const category = (LEGACY as readonly string[]).includes(type.key) ? (type.key as (typeof LEGACY)[number]) : "other";

  const rel = `clients/${personId}/${randomUUID()}${ext}`;
  await putFile(rel, new Uint8Array(await file.arrayBuffer()), file.type || "application/pdf");

  // The searchable text, read once at upload. A failed read leaves the file as it is.
  const layer = await textLayerFor(file);
  await audited(db, { userId: user.id }).insert(schema.clientDocuments, {
    ...(layer ?? {}),
    personId,
    ...parsed.data,
    category,
    fileName: file.name,
    filePath: rel,
    mimeType: file.type || "application/pdf",
    sizeBytes: file.size,
    uploadedBy: user.id,
  });
  revalidatePath(`/clients/${personId}`);
  return { ok: true };
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

/** Reads a document filed before reading existed, so it becomes searchable. */
export async function indexClientDocument(id: string, personId: string): Promise<{ ok?: true; error?: string }> {
  const user = await requireUser(["admin", "supervisor"]);
  const r = await indexStoredDocument("client", id, user.id);
  if (r.ok) revalidatePath(`/clients/${personId}`);
  return r;
}

/** Archives (or restores) a document. The file stays on the record; only the lists change. */
export async function setClientDocumentArchived(id: string, personId: string, archived: boolean): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [doc] = await db.select({ id: schema.clientDocuments.id, personId: schema.clientDocuments.personId }).from(schema.clientDocuments).where(eq(schema.clientDocuments.id, id)).limit(1);
  if (!doc || doc.personId !== personId) return;
  await audited(db, { userId: user.id }).update(schema.clientDocuments, id, archived ? { archivedAt: new Date(), archivedBy: user.id } : { archivedAt: null, archivedBy: null });
  revalidatePath(`/clients/${personId}`);
}
