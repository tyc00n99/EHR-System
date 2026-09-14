"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { aiConfigured, explainAiError } from "@/lib/ai/extract-agreement";
import { nameMatches, readCredentialDocument, readable, type CredentialRead } from "@/lib/ai/read-document";
import { indexStoredDocument, textLayerFor, type TextLayer } from "@/lib/document-text";
import { deleteFile, putFile } from "@/lib/storage";
import { STAFF_DOCUMENT_CATEGORIES, type StaffDocumentCategory as Category } from "@/lib/staff-documents";
import { CREDENTIAL_TYPE_VALUES, type ActionState } from "@/lib/validation";

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
  meta: { category: Category; title: string; note?: string | null; credentialId?: string | null; /** A text layer already read from this file; otherwise the file is read here. */ read?: TextLayer | null },
): Promise<{ id?: string; error?: string }> {
  const ext = ALLOWED[file.type] ?? (file.name.toLowerCase().endsWith(".pdf") ? ".pdf" : null);
  if (!ext) return { error: "Use a PDF, image, or Word document" };
  if (file.size > MAX_BYTES) return { error: "Files must be under 25 MB" };
  const path = `staff/${staffId}/${randomUUID()}${ext}`;
  await putFile(path, new Uint8Array(await file.arrayBuffer()), file.type || "application/pdf");
  // The searchable text, read once. A read that was already done on this file rides in on `meta.read`.
  const layer = meta.read ?? (await textLayerFor(file));
  const db = await getDb();
  const row = await audited(db, { userId }).insert(schema.staffDocuments, {
    ...(layer ?? {}),
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

/** Reads a stored document that was filed before reading existed, so it becomes searchable. */
export async function indexStaffDocument(id: string, staffId: string): Promise<{ ok?: true; error?: string }> {
  const user = await requireUser(["admin", "supervisor"]);
  const r = await indexStoredDocument("staff", id, user.id);
  if (r.ok) revalidatePath(`/staff/${staffId}`);
  return r;
}

export interface CredentialReadState {
  read?: CredentialRead;
  fileName?: string;
  /** False when the name on the paper is not this person's. Null when no name was printed. */
  nameOk?: boolean | null;
  /** The item the document appears to be, when it is not the one being recorded. */
  looksLike?: string;
  message?: string;
  /** Changes on every read so the form can reset its prefilled fields. */
  readId?: number;
}

/**
 * Reads a certificate, letter or signed form before it is saved, so the Record form fills in
 * from the paper. The file is not stored here — it is uploaded again with the form, and the text
 * read now rides along in hidden fields so the document is read once, not twice.
 */
export async function readCredentialFile(staffId: string, expectedType: string, _prev: CredentialReadState, fd: FormData): Promise<CredentialReadState> {
  await requireUser(["admin", "supervisor"]);
  const readId = Date.now();
  if (!aiConfigured()) return { readId, message: "Document reading is off. An admin can turn it on by adding ANTHROPIC_API_KEY to the app's environment settings. Fill the fields in by hand." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { readId, message: "Choose a file first." };
  if (file.size > MAX_BYTES) return { readId, message: "Files must be under 25 MB" };
  if (!readable(file.type, file.name)) return { readId, fileName: file.name, message: "Word documents and HEIC photos cannot be read; the file will still be attached. Fill the fields in by hand." };
  const db = await getDb();
  const [person] = await db.select({ firstName: schema.staff.firstName, lastName: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  try {
    const read = await readCredentialDocument(new Uint8Array(await file.arrayBuffer()), file.type || "application/pdf", file.name, expectedType);
    const nameOk = person ? nameMatches(read.personName, person.firstName, person.lastName) : null;
    const looksLike = read.documentType && read.documentType !== expectedType && (CREDENTIAL_TYPE_VALUES as readonly string[]).includes(read.documentType) ? read.documentType : undefined;
    return { readId, read, fileName: file.name, nameOk, looksLike };
  } catch (e) {
    return { readId, fileName: file.name, message: explainAiError(e) };
  }
}
