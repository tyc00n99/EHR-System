"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { deleteFile, putFile } from "@/lib/storage";
import { STAFF_DOCUMENT_CATEGORIES, type StaffDocumentCategory as Category } from "@/lib/staff-documents";
import type { ActionState } from "@/lib/validation";

/**
 * Staff documents: the background study, certificates, tax and employment forms an agency keeps on
 * each person. Same storage as client documents — bytes in `stored_files`, served only through an
 * authenticated route — and every write is audited, because a licensing review asks who filed the
 * background study and when.
 */

const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};
const MAX_BYTES = 25 * 1024 * 1024;

/** Validates and stores one uploaded file for a staff member. Shared by the two forms that take one. */
export async function storeStaffFile(
  userId: string,
  staffId: string,
  file: File,
  meta: { category: Category; title: string; note?: string | null; credentialId?: string | null },
): Promise<{ id?: string; error?: string }> {
  const ext = ALLOWED[file.type] ?? (file.name.toLowerCase().endsWith(".pdf") ? ".pdf" : null);
  if (!ext) return { error: "Use a PDF, image, or Word document" };
  if (file.size > MAX_BYTES) return { error: "Files must be under 25 MB" };
  const path = `staff/${staffId}/${randomUUID()}${ext}`;
  await putFile(path, new Uint8Array(await file.arrayBuffer()), file.type || "application/pdf");
  const db = await getDb();
  const row = await audited(db, { userId }).insert(schema.staffDocuments, {
    staffId,
    category: meta.category,
    title: meta.title,
    fileName: file.name,
    filePath: path,
    mimeType: file.type || "application/pdf",
    sizeBytes: file.size,
    credentialId: meta.credentialId ?? null,
    note: meta.note ?? null,
    uploadedBy: userId,
  });
  return { id: row.id };
}

export async function uploadStaffDocument(staffId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const category = String(fd.get("category") ?? "");
  const title = String(fd.get("title") ?? "").trim().slice(0, 200);
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000);
  const file = fd.get("file");
  if (!STAFF_DOCUMENT_CATEGORIES.some((c) => c.value === category)) return { errors: { category: "Choose a category" } };
  if (!title) return { errors: { title: "Give the document a title" } };
  if (!(file instanceof File) || file.size === 0) return { errors: { file: "Choose a file" } };
  const stored = await storeStaffFile(user.id, staffId, file, { category: category as Category, title, note: note || null });
  if (stored.error) return { errors: { file: stored.error } };
  revalidatePath(`/staff/${staffId}`);
  return { ok: true, message: "Document filed." };
}

export async function deleteStaffDocument(id: string, staffId: string): Promise<void> {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  const [doc] = await db.select().from(schema.staffDocuments).where(eq(schema.staffDocuments.id, id)).limit(1);
  if (!doc || doc.staffId !== staffId) return;
  await audited(db, { userId: user.id }).delete(schema.staffDocuments, id);
  await deleteFile(doc.filePath);
  revalidatePath(`/staff/${staffId}`);
}

/** Files a document against a credential that was recorded before documents were required. */
export async function attachToCredential(staffId: string, credentialId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: { file: "Choose a file" } };
  const db = await getDb();
  const [cred] = await db.select().from(schema.staffCredentials).where(eq(schema.staffCredentials.id, credentialId)).limit(1);
  if (!cred || cred.staffId !== staffId) return { message: "That credential is not on this record." };
  const { categoryForCredential } = await import("@/lib/staff-documents");
  const stored = await storeStaffFile(user.id, staffId, file, { category: categoryForCredential(cred.type), title: cred.title, credentialId });
  if (stored.error) return { errors: { file: stored.error } };
  revalidatePath(`/staff/${staffId}`);
  return { ok: true, message: "Document attached." };
}
